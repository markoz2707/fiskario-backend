import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KmsService } from './kms.service';

@Injectable()
export class DatabaseEncryptionService {
  private readonly logger = new Logger(DatabaseEncryptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kmsService: KmsService,
  ) {}

  /**
   * Encrypts sensitive data before storing in database
   */
  async encryptSensitiveData(data: string): Promise<string> {
    try {
      // First encrypt with KMS for additional security layer
      const kmsEncrypted = await this.kmsService.encrypt(data);

      // Then use pgcrypto for database-level encryption
      const query = `
        SELECT encode(
          pgcrypto.encrypt(
            decode($1, 'base64'),
            (SELECT value FROM encryption_keys WHERE key_name = 'master_key' LIMIT 1),
            'aes-cbc/pad:pkcs'
          ),
          'base64'
        ) as encrypted_data
      `;

      const result = await this.prisma.$queryRawUnsafe(
        query,
        kmsEncrypted.encryptedData
      ) as { encrypted_data: string }[];

      return result[0]?.encrypted_data || '';
    } catch (error) {
      this.logger.error(`Failed to encrypt sensitive data: ${error.message}`, error.stack);
      throw new Error(`Database encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts sensitive data from database
   */
  async decryptSensitiveData(encryptedData: string): Promise<string> {
    try {
      // First decrypt with pgcrypto
      const query = `
        SELECT encode(
          pgcrypto.decrypt(
            decode($1, 'base64'),
            (SELECT value FROM encryption_keys WHERE key_name = 'master_key' LIMIT 1),
            'aes-cbc/pad:pkcs'
          ),
          'utf8'
        ) as decrypted_data
      `;

      const result = await this.prisma.$queryRawUnsafe(
        query,
        encryptedData
      ) as { decrypted_data: Buffer }[];

      const decryptedBuffer = result[0]?.decrypted_data;
      if (!decryptedBuffer) {
        throw new Error('Failed to decrypt data from database');
      }

      // Then decrypt with KMS
      const kmsDecrypted = await this.kmsService.decrypt(decryptedBuffer.toString());

      return kmsDecrypted.decryptedData;
    } catch (error) {
      this.logger.error(`Failed to decrypt sensitive data: ${error.message}`, error.stack);
      throw new Error(`Database decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypts user password
   */
  async encryptPassword(password: string): Promise<string> {
    return this.encryptSensitiveData(password);
  }

  /**
   * Verifies user password
   */
  async verifyPassword(password: string, encryptedPassword: string): Promise<boolean> {
    try {
      const decryptedPassword = await this.decryptSensitiveData(encryptedPassword);
      return decryptedPassword === password;
    } catch (error) {
      this.logger.error(`Password verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Encrypts NIP number
   */
  async encryptNIP(nip: string): Promise<string> {
    return this.encryptSensitiveData(nip);
  }

  /**
   * Decrypts NIP number
   */
  async decryptNIP(encryptedNIP: string): Promise<string> {
    return this.decryptSensitiveData(encryptedNIP);
  }

  /**
   * Encrypts PESEL number
   */
  async encryptPESEL(pesel: string): Promise<string> {
    return this.encryptSensitiveData(pesel);
  }

  /**
   * Decrypts PESEL number
   */
  async decryptPESEL(encryptedPESEL: string): Promise<string> {
    return this.decryptSensitiveData(encryptedPESEL);
  }

  /**
   * Initializes encryption keys in database
   */
  async initializeEncryptionKeys(): Promise<void> {
    try {
      // Check if encryption keys table exists
      const tableExists = await this.prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'encryption_keys'
        );
      `);

      if (!tableExists[0].exists) {
        // Create encryption keys table
        await this.prisma.$queryRawUnsafe(`
          CREATE TABLE encryption_keys (
            id SERIAL PRIMARY KEY,
            key_name VARCHAR(100) UNIQUE NOT NULL,
            value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Generate and store master key
        const masterKey = await this.kmsService.generateDataKey();
        await this.prisma.$queryRawUnsafe(`
          INSERT INTO encryption_keys (key_name, value)
          VALUES ('master_key', $1)
        `, Buffer.from(masterKey.encryptedKey).toString('base64'));

        this.logger.log('Encryption keys initialized successfully');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize encryption keys: ${error.message}`, error.stack);
      throw new Error(`Encryption key initialization failed: ${error.message}`);
    }
  }

  /**
   * Rotates encryption keys
   */
  async rotateEncryptionKeys(): Promise<void> {
    try {
      // Generate new master key
      const newKey = await this.kmsService.generateDataKey();

      // Update the key in database
      await this.prisma.$queryRawUnsafe(`
        UPDATE encryption_keys
        SET value = $1, updated_at = CURRENT_TIMESTAMP
        WHERE key_name = 'master_key'
      `, Buffer.from(newKey.encryptedKey).toString('base64'));

      this.logger.log('Encryption keys rotated successfully');
    } catch (error) {
      this.logger.error(`Failed to rotate encryption keys: ${error.message}`, error.stack);
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  /**
   * Creates a secure hash for non-reversible data
   */
  async createSecureHash(data: string, salt?: string): Promise<string> {
    try {
      const saltValue = salt || this.generateSalt();
      const query = `
        SELECT encode(
          pgcrypto.digest(
            $1 || $2,
            'sha256'
          ),
          'hex'
        ) as hash
      `;

      const result = await this.prisma.$queryRawUnsafe(
        query,
        data,
        saltValue
      ) as { hash: string }[];

      return `${result[0]?.hash}:${saltValue}`;
    } catch (error) {
      this.logger.error(`Failed to create secure hash: ${error.message}`, error.stack);
      throw new Error(`Secure hash creation failed: ${error.message}`);
    }
  }

  /**
   * Verifies data against a secure hash
   */
  async verifySecureHash(data: string, hashedData: string): Promise<boolean> {
    try {
      const [hash, salt] = hashedData.split(':');
      const newHash = await this.createSecureHash(data, salt);
      return newHash.split(':')[0] === hash;
    } catch (error) {
      this.logger.error(`Failed to verify secure hash: ${error.message}`);
      return false;
    }
  }

  /**
   * Generates a cryptographically secure salt
   */
  private generateSalt(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Encrypts data for GDPR compliance (reversible encryption)
   */
  async encryptForGDPR(data: string, purpose: string): Promise<string> {
    try {
      // Use purpose-specific encryption context
      const context = { purpose, timestamp: new Date().toISOString() };
      const kmsEncrypted = await this.kmsService.encryptSensitive(data, context);

      return Buffer.from(JSON.stringify({
        encrypted: kmsEncrypted.encryptedData,
        keyId: kmsEncrypted.keyId,
        context
      })).toString('base64');
    } catch (error) {
      this.logger.error(`GDPR encryption failed: ${error.message}`, error.stack);
      throw new Error(`GDPR encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts GDPR-encrypted data
   */
  async decryptForGDPR(encryptedData: string): Promise<string> {
    try {
      const parsed = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
      return await this.kmsService.decryptSensitive(parsed.encrypted, parsed.keyId, parsed.context);
    } catch (error) {
      this.logger.error(`GDPR decryption failed: ${error.message}`, error.stack);
      throw new Error(`GDPR decryption failed: ${error.message}`);
    }
  }
}