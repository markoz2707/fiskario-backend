import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  GetObjectCommandOutput,
  ObjectCannedACL,
  BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3UploadResult {
  bucket: string;
  key: string;
  location: string;
  etag: string;
  serverSideEncryption?: string;
}

export interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  serverSideEncryption?: string;
}

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(S3Service.name);
  private readonly defaultBucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION', 'eu-central-1');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: accessKeyId && secretAccessKey ? {
        accessKeyId,
        secretAccessKey,
      } : undefined,
    });

    this.defaultBucket = this.configService.get<string>('AWS_S3_BUCKET', '');

    if (!this.defaultBucket) {
      this.logger.warn('AWS_S3_BUCKET not configured. S3 operations will fail.');
    }
  }

  /**
   * Uploads an object to S3 with KMS encryption
   */
  async uploadObject(
    key: string,
    body: Buffer | string,
    bucket?: string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      kmsKeyId?: string;
      acl?: string;
    }
  ): Promise<S3UploadResult> {
    try {
      const targetBucket = bucket || this.defaultBucket;

      if (!targetBucket) {
        throw new Error('No S3 bucket specified');
      }

      const command = new PutObjectCommand({
        Bucket: targetBucket,
        Key: key,
        Body: body,
        ContentType: options?.contentType || 'application/octet-stream',
        Metadata: options?.metadata,
        ServerSideEncryption: 'AES256', // Use S3-managed encryption
        ...(options?.kmsKeyId && {
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: options.kmsKeyId,
        }),
        ...(options?.acl && { ACL: options.acl as ObjectCannedACL }),
      });

      const response = await this.s3Client.send(command);

      return {
        bucket: targetBucket,
        key,
        location: `https://${targetBucket}.s3.${this.region}.amazonaws.com/${key}`,
        etag: response.ETag || '',
        serverSideEncryption: response.ServerSideEncryption,
      };
    } catch (error) {
      this.logger.error(`Failed to upload object to S3: ${error.message}`, error.stack);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Downloads an object from S3
   */
  async downloadObject(key: string, bucket?: string): Promise<GetObjectCommandOutput> {
    try {
      const targetBucket = bucket || this.defaultBucket;

      if (!targetBucket) {
        throw new Error('No S3 bucket specified');
      }

      const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      return await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(`Failed to download object from S3: ${error.message}`, error.stack);
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  /**
   * Gets object metadata without downloading the full object
   */
  async getObjectMetadata(key: string, bucket?: string): Promise<S3ObjectInfo> {
    try {
      const targetBucket = bucket || this.defaultBucket;

      if (!targetBucket) {
        throw new Error('No S3 bucket specified');
      }

      const command = new HeadObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || '',
        serverSideEncryption: response.ServerSideEncryption,
      };
    } catch (error) {
      this.logger.error(`Failed to get object metadata from S3: ${error.message}`, error.stack);
      throw new Error(`S3 metadata fetch failed: ${error.message}`);
    }
  }

  /**
   * Deletes an object from S3
   */
  async deleteObject(key: string, bucket?: string): Promise<void> {
    try {
      const targetBucket = bucket || this.defaultBucket;

      if (!targetBucket) {
        throw new Error('No S3 bucket specified');
      }

      const command = new DeleteObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted object: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete object from S3: ${error.message}`, error.stack);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Lists objects in a bucket with optional prefix
   */
  async listObjects(
    prefix?: string,
    bucket?: string,
    maxKeys: number = 100
  ): Promise<S3ObjectInfo[]> {
    try {
      const targetBucket = bucket || this.defaultBucket;

      if (!targetBucket) {
        throw new Error('No S3 bucket specified');
      }

      const command = new ListObjectsV2Command({
        Bucket: targetBucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.s3Client.send(command);

      return (response.Contents || []).map((object) => ({
        key: object.Key || '',
        size: object.Size || 0,
        lastModified: object.LastModified || new Date(),
        etag: object.ETag || '',
      }));
    } catch (error) {
      this.logger.error(`Failed to list objects from S3: ${error.message}`, error.stack);
      throw new Error(`S3 list objects failed: ${error.message}`);
    }
  }

  /**
   * Generates a pre-signed URL for temporary access to an S3 object
   */
  async generatePresignedUrl(
    key: string,
    operation: 'GET' | 'PUT' = 'GET',
    expiresIn: number = 3600,
    bucket?: string
  ): Promise<string> {
    try {
      const targetBucket = bucket || this.defaultBucket;

      if (!targetBucket) {
        throw new Error('No S3 bucket specified');
      }

      const command = operation === 'GET'
        ? new GetObjectCommand({ Bucket: targetBucket, Key: key })
        : new PutObjectCommand({ Bucket: targetBucket, Key: key });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      return signedUrl;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
      throw new Error(`Presigned URL generation failed: ${error.message}`);
    }
  }

  /**
   * Creates a new S3 bucket with encryption enabled
   */
  async createBucket(
    bucketName: string,
    region?: string
  ): Promise<void> {
    try {
      const targetRegion = region || this.region;

      const command = new CreateBucketCommand({
        Bucket: bucketName,
        CreateBucketConfiguration: targetRegion !== 'us-east-1' ? {
          LocationConstraint: targetRegion as BucketLocationConstraint,
        } : undefined,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully created bucket: ${bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to create S3 bucket: ${error.message}`, error.stack);
      throw new Error(`S3 bucket creation failed: ${error.message}`);
    }
  }

  /**
   * Deletes an S3 bucket (must be empty)
   */
  async deleteBucket(bucketName: string): Promise<void> {
    try {
      const command = new DeleteBucketCommand({
        Bucket: bucketName,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted bucket: ${bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to delete S3 bucket: ${error.message}`, error.stack);
      throw new Error(`S3 bucket deletion failed: ${error.message}`);
    }
  }

  /**
   * Lists all buckets in the account
   */
  async listBuckets(): Promise<Array<{ name: string; creationDate: Date }>> {
    try {
      const command = new ListBucketsCommand({});
      const response = await this.s3Client.send(command);

      return (response.Buckets || []).map((bucket) => ({
        name: bucket.Name || '',
        creationDate: bucket.CreationDate || new Date(),
      }));
    } catch (error) {
      this.logger.error(`Failed to list S3 buckets: ${error.message}`, error.stack);
      throw new Error(`S3 bucket listing failed: ${error.message}`);
    }
  }

  /**
   * Uploads a file with automatic encryption and metadata
   */
  async uploadEncryptedFile(
    key: string,
    fileBuffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
    kmsKeyId?: string,
    bucket?: string
  ): Promise<S3UploadResult> {
    return this.uploadObject(key, fileBuffer, bucket, {
      contentType,
      metadata,
      kmsKeyId,
    });
  }

  /**
   * Downloads and decrypts a file (if encrypted)
   */
  async downloadFile(key: string, bucket?: string): Promise<Buffer> {
    const response = await this.downloadObject(key, bucket);

    if (response.Body) {
      // Convert the stream to buffer using a simpler approach
      const chunks: Uint8Array[] = [];

      if (response.Body instanceof ReadableStream) {
        const reader = response.Body.getReader();
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            chunks.push(value);
          }
        }
      } else {
        // Fallback for other stream types
        const reader = response.Body.transformToWebStream();
        const streamReader = reader.getReader();
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await streamReader.read();
          done = readerDone;
          if (value) {
            chunks.push(value);
          }
        }
      }

      return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
    }

    throw new Error('No body in response');
  }
}