import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import {
  ProfilZaufanyProfile,
  ProfilZaufanyConfig,
  SignatureRequest,
  SignatureResponse,
  ProfilZaufanyAuthDto
} from '../interfaces/digital-signature.interface';

@Injectable()
export class ProfilZaufanyService {
  private readonly logger = new Logger(ProfilZaufanyService.name);
  private readonly config: ProfilZaufanyConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.config = {
      apiUrl: this.configService.get<string>('PROFIL_ZAUFANY_API_URL', 'https://pz.gov.pl'),
      clientId: this.configService.get<string>('PROFIL_ZAUFANY_CLIENT_ID', ''),
      clientSecret: this.configService.get<string>('PROFIL_ZAUFANY_CLIENT_SECRET', ''),
      redirectUri: this.configService.get<string>('PROFIL_ZAUFANY_REDIRECT_URI', ''),
      scopes: ['profile', 'signature'],
      environment: this.configService.get<string>('NODE_ENV') === 'production' ? 'prod' : 'test'
    };
  }

  /**
   * Generate authorization URL for Profil Zaufany OAuth2 flow
   */
  async generateAuthUrl(state: string, documentId?: string): Promise<string> {
    try {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        scope: this.config.scopes.join(' '),
        state: state,
        ...(documentId && { document_id: documentId })
      });

      return `${this.config.apiUrl}/oauth/authorize?${params.toString()}`;
    } catch (error) {
      this.logger.error('Failed to generate Profil Zaufany auth URL', error);
      throw new BadRequestException('Failed to generate authorization URL');
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(authDto: ProfilZaufanyAuthDto): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    profile: ProfilZaufanyProfile;
  }> {
    try {
      const tokenResponse: AxiosResponse = await axios.post(`${this.config.apiUrl}/oauth/token`, {
        grant_type: 'authorization_code',
        code: authDto.authorizationCode,
        redirect_uri: authDto.redirectUri || this.config.redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data as any;

      // Get user profile information
      const profile = await this.getUserProfile(access_token);

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        profile
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for token', error);
      throw new UnauthorizedException('Invalid authorization code');
    }
  }

  /**
   * Get user profile from Profil Zaufany
   */
  private async getUserProfile(accessToken: string): Promise<ProfilZaufanyProfile> {
    try {
      const response: AxiosResponse = await axios.get(`${this.config.apiUrl}/api/profile`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.data as any;
      return {
        profileId: data.profileId,
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        pesel: data.pesel,
        email: data.email,
        phoneNumber: data.phoneNumber,
        authenticationLevel: data.authenticationLevel || 'basic',
        createdAt: new Date(data.createdAt),
        lastLoginAt: data.lastLoginAt ? new Date(data.lastLoginAt) : undefined,
      };
    } catch (error) {
      this.logger.error('Failed to get user profile', error);
      throw new UnauthorizedException('Failed to retrieve user profile');
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    try {
      const response: AxiosResponse = await axios.post(`${this.config.apiUrl}/oauth/token`, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      const data = response.data as any;
      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      this.logger.error('Failed to refresh access token', error);
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  /**
   * Validate access token
   */
  async validateAccessToken(accessToken: string): Promise<boolean> {
    try {
      await axios.get(`${this.config.apiUrl}/oauth/validate`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return true;
    } catch (error) {
      this.logger.error('Token validation failed', error);
      return false;
    }
  }

  /**
   * Initiate signature process with Profil Zaufany
   */
  async initiateSignature(
    signatureRequest: SignatureRequest,
    accessToken: string
  ): Promise<SignatureResponse> {
    try {
      // Create signature request in Profil Zaufany system
      const response: AxiosResponse = await axios.post(
        `${this.config.apiUrl}/api/signatures`,
        {
          documentId: signatureRequest.documentId,
          documentType: signatureRequest.documentType,
          signatureType: signatureRequest.signatureType,
          userIdentifier: signatureRequest.userIdentifier,
          additionalData: signatureRequest.additionalData,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = response.data as any;
      return {
        signatureId: data.signatureId,
        status: 'pending',
        redirectUrl: data.redirectUrl,
      };
    } catch (error) {
      this.logger.error('Failed to initiate signature', error);
      throw new BadRequestException('Failed to initiate signature process');
    }
  }

  /**
   * Check signature status
   */
  async getSignatureStatus(signatureId: string, accessToken: string): Promise<SignatureResponse> {
    try {
      const response: AxiosResponse = await axios.get(`${this.config.apiUrl}/api/signatures/${signatureId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.data as any;
      return {
        signatureId: data.signatureId,
        status: data.status,
        signature: data.signature,
        error: data.error,
      };
    } catch (error) {
      this.logger.error('Failed to get signature status', error);
      throw new BadRequestException('Failed to retrieve signature status');
    }
  }

  /**
   * Generate state parameter for OAuth2 flow
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify state parameter
   */
  verifyState(receivedState: string, storedState: string): boolean {
    return receivedState === storedState;
  }
}