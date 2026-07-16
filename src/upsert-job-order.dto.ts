import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DiscountType, DocType, JobOrderStatus, JobOrderType } from '@prisma/client';

export class JobOrderItemDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  /** Links this line to an inventory item so stock deducts when the order completes. */
  @IsOptional()
  @IsString()
  inventoryItemId?: string;
}

export class UpsertJobOrderDto {
  /** Targets an existing order directly — required to re-save standalone orders (no jobId). */
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsEnum(JobOrderStatus)
  status?: JobOrderStatus;

  @IsOptional()
  @IsEnum(JobOrderType)
  type?: JobOrderType;

  @IsOptional()
  @IsInt()
  @Min(1)
  cameraCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cameraRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  laborPct?: number;

  @IsOptional()
  @IsEnum(DocType)
  docType?: DocType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobOrderItemDto)
  items!: JobOrderItemDto[];
}

/** Turns a standalone quotation into a job order by creating its installation job. */
export class ConvertJobOrderDto {
  @IsDateString()
  scheduleDate!: string;

  @IsOptional()
  @IsString()
  installerId?: string;
}
