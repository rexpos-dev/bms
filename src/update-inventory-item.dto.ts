import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockAlert?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Null leaves the item uncategorised, which shows it in every job order type. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  categoryId?: string | null;
}
