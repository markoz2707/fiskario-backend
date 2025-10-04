import { IsEnum, IsString, IsOptional, IsUUID, IsDateString, IsObject } from 'class-validator';
import { SignatureType, SignatureFormat } from '../interfaces/digital-signature.interface';

export class CreateSignatureDto {
  @IsString()
  documentId: string;

  @IsString()
  documentType: string;

  @IsEnum(SignatureType)
  signatureType: SignatureType;

  @IsEnum(SignatureFormat)
  signatureFormat: SignatureFormat;

  @IsOptional()
  @IsString()
  certificateId?: string;

  @IsString()
  userIdentifier: string; // PESEL for individuals, NIP for companies

  @IsOptional()
  @IsObject()
  additionalData?: Record<string, any>;

  @IsOptional()
  @IsString()
  callbackUrl?: string;
}