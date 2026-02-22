import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { ProfilZaufanyService } from './profil-zaufany.service';
import { SignatureType, SignatureFormat } from '../interfaces/digital-signature.interface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ProfilZaufanyService', () => {
  let service: ProfilZaufanyService;
  let configService: ConfigService;
  let jwtService: JwtService;

  const mockConfigValues: Record<string, string> = {
    PROFIL_ZAUFANY_API_URL: 'https://pz.test.gov.pl',
    PROFIL_ZAUFANY_CLIENT_ID: 'test-client-id',
    PROFIL_ZAUFANY_CLIENT_SECRET: 'test-client-secret',
    PROFIL_ZAUFANY_REDIRECT_URI: 'https://app.fiskario.pl/callback',
    NODE_ENV: 'test',
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      return mockConfigValues[key] ?? defaultValue;
    }),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilZaufanyService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<ProfilZaufanyService>(ProfilZaufanyService);
    configService = module.get<ConfigService>(ConfigService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // generateAuthUrl
  // =========================================================
  describe('generateAuthUrl', () => {
    it('should generate a valid authorization URL with required params', async () => {
      const state = 'random-state-value';
      const url = await service.generateAuthUrl(state);

      expect(url).toContain('https://pz.test.gov.pl/oauth/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.fiskario.pl%2Fcallback');
      expect(url).toContain('scope=profile+signature');
      expect(url).toContain(`state=${state}`);
    });

    it('should include document_id param when documentId is provided', async () => {
      const state = 'state-123';
      const documentId = 'doc-456';
      const url = await service.generateAuthUrl(state, documentId);

      expect(url).toContain('document_id=doc-456');
    });

    it('should NOT include document_id param when documentId is not provided', async () => {
      const state = 'state-789';
      const url = await service.generateAuthUrl(state);

      expect(url).not.toContain('document_id');
    });
  });

  // =========================================================
  // exchangeCodeForToken
  // =========================================================
  describe('exchangeCodeForToken', () => {
    const mockTokenResponse = {
      data: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
      },
    };

    const mockProfileResponse = {
      data: {
        profileId: 'profile-1',
        userId: 'user-1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        pesel: '90010112345',
        email: 'jan@example.com',
        phoneNumber: '+48123456789',
        authenticationLevel: 'significant',
        createdAt: '2024-01-15T10:00:00Z',
        lastLoginAt: '2025-06-01T12:00:00Z',
      },
    };

    it('should exchange authorization code for tokens and return profile', async () => {
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.get.mockResolvedValueOnce(mockProfileResponse);

      const result = await service.exchangeCodeForToken({
        authorizationCode: 'valid-code',
        state: 'state-1',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.expiresIn).toBe(3600);
      expect(result.profile.firstName).toBe('Jan');
      expect(result.profile.lastName).toBe('Kowalski');
      expect(result.profile.pesel).toBe('90010112345');
    });

    it('should send correct parameters to the token endpoint', async () => {
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.get.mockResolvedValueOnce(mockProfileResponse);

      await service.exchangeCodeForToken({
        authorizationCode: 'auth-code-123',
        state: 'state-abc',
        redirectUri: 'https://custom-redirect.pl/callback',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://pz.test.gov.pl/oauth/token',
        {
          grant_type: 'authorization_code',
          code: 'auth-code-123',
          redirect_uri: 'https://custom-redirect.pl/callback',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
        },
      );
    });

    it('should throw UnauthorizedException when authorization code is invalid', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Invalid code'));

      await expect(
        service.exchangeCodeForToken({
          authorizationCode: 'invalid-code',
          state: 'state-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================
  // refreshAccessToken
  // =========================================================
  describe('refreshAccessToken', () => {
    it('should refresh the access token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-access-token',
          expires_in: 7200,
        },
      });

      const result = await service.refreshAccessToken('valid-refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.expiresIn).toBe(7200);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://pz.test.gov.pl/oauth/token',
        {
          grant_type: 'refresh_token',
          refresh_token: 'valid-refresh-token',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
        },
      );
    });

    it('should throw UnauthorizedException when refresh token is expired', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Token expired'));

      await expect(
        service.refreshAccessToken('expired-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================
  // validateAccessToken
  // =========================================================
  describe('validateAccessToken', () => {
    it('should return true for a valid access token', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { valid: true } });

      const result = await service.validateAccessToken('valid-token');

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://pz.test.gov.pl/oauth/validate',
        { headers: { Authorization: 'Bearer valid-token' } },
      );
    });

    it('should return false when token validation fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Invalid token'));

      const result = await service.validateAccessToken('invalid-token');

      expect(result).toBe(false);
    });
  });

  // =========================================================
  // initiateSignature
  // =========================================================
  describe('initiateSignature', () => {
    it('should initiate signature and return pending response with redirect URL', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          signatureId: 'sig-001',
          redirectUrl: 'https://pz.test.gov.pl/sign/sig-001',
        },
      });

      const request = {
        documentId: 'doc-123',
        documentType: 'JPK_V7',
        signatureType: SignatureType.PROFIL_ZAUFANY,
        signatureFormat: SignatureFormat.XADES,
        userIdentifier: '90010112345',
      };

      const result = await service.initiateSignature(request, 'access-token-123');

      expect(result.signatureId).toBe('sig-001');
      expect(result.status).toBe('pending');
      expect(result.redirectUrl).toBe('https://pz.test.gov.pl/sign/sig-001');
    });

    it('should throw BadRequestException when signature initiation fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Server error'));

      const request = {
        documentId: 'doc-123',
        documentType: 'JPK_V7',
        signatureType: SignatureType.PROFIL_ZAUFANY,
        signatureFormat: SignatureFormat.XADES,
        userIdentifier: '90010112345',
      };

      await expect(
        service.initiateSignature(request, 'access-token'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================
  // getSignatureStatus
  // =========================================================
  describe('getSignatureStatus', () => {
    it('should return signature status with completed data', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          signatureId: 'sig-001',
          status: 'completed',
          signature: 'base64-signature-data',
          error: null,
        },
      });

      const result = await service.getSignatureStatus('sig-001', 'access-token');

      expect(result.signatureId).toBe('sig-001');
      expect(result.status).toBe('completed');
      expect(result.signature).toBe('base64-signature-data');
      expect(result.error).toBeNull();
    });

    it('should throw BadRequestException when status retrieval fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Not found'));

      await expect(
        service.getSignatureStatus('nonexistent-sig', 'access-token'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================
  // generateState and verifyState
  // =========================================================
  describe('generateState', () => {
    it('should generate a 64-character hex state string', () => {
      const state = service.generateState();

      expect(state).toHaveLength(64);
      expect(state).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique state values on each call', () => {
      const state1 = service.generateState();
      const state2 = service.generateState();

      expect(state1).not.toBe(state2);
    });
  });

  describe('verifyState', () => {
    it('should return true when received state matches stored state', () => {
      const result = service.verifyState('abc123', 'abc123');
      expect(result).toBe(true);
    });

    it('should return false when received state does not match stored state', () => {
      const result = service.verifyState('abc123', 'xyz789');
      expect(result).toBe(false);
    });
  });
});
