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

  // Ignored on create — trialDays is now derived from expirationDate. Kept for
  // backward compatibility with any external caller that still sends it.
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
