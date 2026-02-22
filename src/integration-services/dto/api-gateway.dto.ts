import { IsString, IsOptional, IsObject } from 'class-validator';

export class RouteRequestDto {
  @IsString()
  method: string;

  @IsString()
  path: string;

  @IsObject()
  @IsOptional()
  headers?: Record<string, string>;

  @IsObject()
  @IsOptional()
  body?: Record<string, any>;
}

export class TaxRouteRequestDto extends RouteRequestDto {
  @IsString()
  tenantId: string;

  @IsString()
  @IsOptional()
  userId?: string;
}
