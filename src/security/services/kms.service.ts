import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  ListKeysCommand,
  KeySpec,
  DataKeySpec,
  EncryptionAlgorithmSpec
} from '@aws-sdk/client-kms';

export interface EncryptionResult {
  encryptedData: string;
  keyId: string;
  algorithm?: string;
}

export interface DecryptionResult {
  decryptedData: string;
  keyId: string;
}

@Injectable()
export class KmsService {
  private readonly kmsClient: KMSClient;
  private readonly logger = new Logger(KmsService.name);
  private readonly masterKeyId: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'eu-central-1');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.kmsClient = new KMSClient({
      region,
      credentials: accessKeyId && secretAccessKey ? {
        accessKeyId,
        secretAccessKey,
      } : undefined,
    });

    this.masterKeyId = this.configService.get<string>('AWS_KMS_MASTER_KEY_ID', '');

    if (!this.masterKeyId) {
      this.logger.warn('AWS_KMS_MASTER_KEY_ID not configured. KMS operations will fail.');
    }
  }

  /**
   * Encrypts data using AWS KMS
   */
  async encrypt(data: string, keyId?: string): Promise<EncryptionResult> {
    try {
      const targetKeyId = keyId || this.masterKeyId;

      if (!targetKeyId) {
        throw new Error('No KMS key ID available for encryption');
      }

      const command = new EncryptCommand({
        KeyId: targetKeyId,
        Plaintext: Buffer.from(data, 'utf8'),
        EncryptionAlgorithm: EncryptionAlgorithmSpec.SYMMETRIC_DEFAULT,
      });

      const response = await this.kmsClient.send(command);

      return {
        encryptedData: Buffer.from(response.CiphertextBlob!).toString('base64'),
        keyId: response.KeyId!,
        algorithm: response.EncryptionAlgorithm,
      };
    } catch (error) {
      this.logger.error(`Failed to encrypt data: ${error.message}`, error.stack);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts data using AWS KMS
   */
  async decrypt(encryptedData: string, keyId?: string): Promise<DecryptionResult> {
    try {
      const targetKeyId = keyId || this.masterKeyId;

      if (!targetKeyId) {
        throw new Error('No KMS key ID available for decryption');
      }

      const command = new DecryptCommand({
        KeyId: targetKeyId,
        CiphertextBlob: Buffer.from(encryptedData, 'base64'),
        EncryptionAlgorithm: EncryptionAlgorithmSpec.SYMMETRIC_DEFAULT,
      });

      const response = await this.kmsClient.send(command);

      return {
        decryptedData: Buffer.from(response.Plaintext!).toString('utf8'),
        keyId: response.KeyId!,
      };
    } catch (error) {
      this.logger.error(`Failed to decrypt data: ${error.message}`, error.stack);
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generates a data key for envelope encryption
   */
  async generateDataKey(keySpec: DataKeySpec = 'AES_256'): Promise<{
    plaintextKey: Buffer;
    encryptedKey: string;
    keyId: string;
  }> {
    try {
      if (!this.masterKeyId) {
        throw new Error('No KMS key ID available for data key generation');
      }

      const command = new GenerateDataKeyCommand({
        KeyId: this.masterKeyId,
        KeySpec: keySpec,
      });

      const response = await this.kmsClient.send(command);

      return {
        plaintextKey: Buffer.from(response.Plaintext!),
        encryptedKey: Buffer.from(response.CiphertextBlob!).toString('base64'),
        keyId: response.KeyId!,
      };
    } catch (error) {
      this.logger.error(`Failed to generate data key: ${error.message}`, error.stack);
      throw new Error(`Data key generation failed: ${error.message}`);
    }
  }

  /**
   * Creates a new KMS key
   */
  async createKey(description: string, keySpec: KeySpec = KeySpec.SYMMETRIC_DEFAULT): Promise<string> {
    try {
      const command = new CreateKeyCommand({
        Description: description,
        KeySpec: keySpec,
        Origin: 'AWS_KMS',
      });

      const response = await this.kmsClient.send(command);

      this.logger.log(`Created new KMS key: ${response.KeyMetadata?.KeyId}`);
      return response.KeyMetadata?.KeyId || '';
    } catch (error) {
      this.logger.error(`Failed to create KMS key: ${error.message}`, error.stack);
      throw new Error(`KMS key creation failed: ${error.message}`);
    }
  }

  /**
   * Describes a KMS key
   */
  async describeKey(keyId: string): Promise<any> {
    try {
      const command = new DescribeKeyCommand({
        KeyId: keyId,
      });

      const response = await this.kmsClient.send(command);
      return response.KeyMetadata;
    } catch (error) {
      this.logger.error(`Failed to describe KMS key: ${error.message}`, error.stack);
      throw new Error(`KMS key description failed: ${error.message}`);
    }
  }

  /**
   * Lists available KMS keys
   */
  async listKeys(limit: number = 10): Promise<any[]> {
    try {
      const command = new ListKeysCommand({
        Limit: limit,
      });

      const response = await this.kmsClient.send(command);
      return response.Keys || [];
    } catch (error) {
      this.logger.error(`Failed to list KMS keys: ${error.message}`, error.stack);
      throw new Error(`KMS key listing failed: ${error.message}`);
    }
  }

  /**
   * Encrypts sensitive data with key rotation support
   */
  async encryptSensitive(data: string, context?: Record<string, string>): Promise<{
    encryptedData: string;
    keyId: string;
    context?: Record<string, string>;
  }> {
    const result = await this.encrypt(data);

    return {
      encryptedData: result.encryptedData,
      keyId: result.keyId,
      context,
    };
  }

  /**
   * Decrypts sensitive data with context verification
   */
  async decryptSensitive(
    encryptedData: string,
    keyId?: string,
    context?: Record<string, string>
  ): Promise<string> {
    const result = await this.decrypt(encryptedData, keyId);
    return result.decryptedData;
  }
}