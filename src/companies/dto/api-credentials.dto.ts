import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';

export class CreateApiCredentialsDto {
  @IsString()
  @IsIn(['ksef', 'zus', 'epuap'])
  service: string;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  clientSecret?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  certificatePath?: string;

  @IsString()
  @IsIn(['test', 'production'])
  @IsOptional()
  environment?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateApiCredentialsDto extends CreateApiCredentialsDto {}
