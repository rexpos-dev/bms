import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateLicenseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseKey?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  // Ignored when expirationDate is also sent. For a full->trial conversion, expirationDate is
  // required regardless — trialDays alone won't work there; it's only sufficient when editing
  // an already-existing trial's other fields.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;
}
