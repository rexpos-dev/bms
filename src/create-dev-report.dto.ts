import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ChecklistItemDto {
  @IsString()
  label!: string;

  @IsBoolean()
  done!: boolean;

  /** Optional per-item note. `doneAt`/`doneBy` are stamped server-side. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateDevReportDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist!: ChecklistItemDto[];

  @IsOptional()
  @IsString()
  taggedAdminId?: string;
}
