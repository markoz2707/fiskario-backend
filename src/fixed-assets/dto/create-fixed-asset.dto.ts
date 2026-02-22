import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// --- Depreciation methods ---
export const DEPRECIATION_METHODS = ['LINEAR', 'DEGRESSIVE', 'ONE_TIME'] as const;
export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number];

// --- Asset statuses ---
export const ASSET_STATUSES = ['ACTIVE', 'SOLD', 'LIQUIDATED', 'TRANSFERRED'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

// --- KST Groups and typical annual rates ---
export const KST_GROUPS: Record<
  string,
  { name: string; minRate: number; maxRate: number; defaultRate: number }
> = {
  '0': { name: 'Grunty', minRate: 0, maxRate: 0, defaultRate: 0 },
  '1': { name: 'Budynki i lokale', minRate: 2.5, maxRate: 10, defaultRate: 2.5 },
  '2': { name: 'Obiekty inzynieryjne', minRate: 4.5, maxRate: 10, defaultRate: 4.5 },
  '3': { name: 'Kotly i maszyny energetyczne', minRate: 7, maxRate: 14, defaultRate: 10 },
  '4': { name: 'Maszyny ogolnego zastosowania', minRate: 14, maxRate: 20, defaultRate: 14 },
  '5': { name: 'Maszyny specjalistyczne', minRate: 14, maxRate: 25, defaultRate: 18 },
  '6': { name: 'Urzadzenia techniczne', minRate: 10, maxRate: 20, defaultRate: 10 },
  '7': { name: 'Srodki transportu', minRate: 14, maxRate: 20, defaultRate: 20 },
  '8': { name: 'Narzedzia, przyrządy, ruchomosci', minRate: 20, maxRate: 20, defaultRate: 20 },
  '9': { name: 'Inwentarz zywy', minRate: 0, maxRate: 0, defaultRate: 0 },
};

// --- Create Fixed Asset DTO ---
export class CreateFixedAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  inventoryNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  kstCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  kstGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString()
  acquisitionDate: string;

  @IsDateString()
  activationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  sourceInvoiceId?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  initialValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  improvementValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salvageValue?: number;

  @IsIn(DEPRECIATION_METHODS)
  depreciationMethod: DepreciationMethod;

  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  annualRate: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

// --- Update Fixed Asset DTO ---
export class UpdateFixedAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  inventoryNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  kstCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  kstGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;

  @IsOptional()
  @IsDateString()
  activationDate?: string;

  @IsOptional()
  @IsDateString()
  deactivationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  sourceInvoiceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  improvementValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salvageValue?: number;

  @IsOptional()
  @IsIn(DEPRECIATION_METHODS)
  depreciationMethod?: DepreciationMethod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  annualRate?: number;

  @IsOptional()
  @IsIn(ASSET_STATUSES)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

// --- Fixed Asset Filters DTO ---
export class FixedAssetFiltersDto {
  @IsOptional()
  @IsIn(ASSET_STATUSES)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  @IsIn(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  kstGroup?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFullyDepreciated?: boolean;

  @IsOptional()
  @IsIn(DEPRECIATION_METHODS)
  depreciationMethod?: DepreciationMethod;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// --- Depreciation Entry Filters DTO ---
export class DepreciationEntryFiltersDto {
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isBooked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
