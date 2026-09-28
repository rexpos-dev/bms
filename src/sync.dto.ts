import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateSyncDeviceDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class PushOpDto {
  @IsUUID()
  opId!: string;

  @IsString()
  @MinLength(1)
  table!: string;

  @IsString()
  @MinLength(1)
  id!: string;

  @IsIn(['I', 'U', 'D'])
  op!: 'I' | 'U' | 'D';

  @IsOptional()
  @IsObject()
  row?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  baseUpdatedAt?: string | null;
}

export class PushDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PushOpDto)
  ops!: PushOpDto[];
}

export class PullQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}

export class SnapshotQueryDto {
  @IsString()
  @MinLength(1)
  table!: string;

  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
