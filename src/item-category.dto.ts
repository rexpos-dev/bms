import { JobOrderType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateItemCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** Null means the category's items appear in every job order type. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(JobOrderType)
  jobOrderType?: JobOrderType | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateItemCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(JobOrderType)
  jobOrderType?: JobOrderType | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
