import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum KSeFEnvironment {
  TEST = 'test',
  PRODUCTION = 'production'
}

export class KSeFAuthDto {
  @IsString()
  token: string;

  @IsEnum(KSeFEnvironment)
  @IsOptional()
  environment?: KSeFEnvironment = KSeFEnvironment.TEST;
}

export class KSeFTokenRequestDto {
  @IsString()
  nip: string;

  @IsString()
  authorizationCode: string;

  @IsEnum(KSeFEnvironment)
  @IsOptional()
  environment?: KSeFEnvironment = KSeFEnvironment.TEST;
}