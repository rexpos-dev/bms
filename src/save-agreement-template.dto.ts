import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AgreementSectionDto {
  /** May be empty — the preamble and signature block carry no title. */
  @IsString()
  heading!: string;

  @IsString()
  body!: string;
}

export class SaveAgreementTemplateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AgreementSectionDto)
  sections!: AgreementSectionDto[];

  /** Free-text reason shown in the version history. */
  @IsOptional()
  @IsString()
  note?: string;
}
