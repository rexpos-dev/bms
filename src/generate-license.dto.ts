import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateLicenseDto {
  // Required for full licenses (issued by the 3rd-party provider). Ignored for
  // trials — the server auto-generates a unique TRIAL- key.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseKey?: string;

  @IsString()
  clientId!: string;

  @IsString()
  productId!: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  // Trial length in days (default 30). Only used when isTrial is true.
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
