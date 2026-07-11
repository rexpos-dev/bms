import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class RestoreBackupDto {
  /** The requesting Super Admin's own login password — verified before any restore. */
  @IsString()
  @MinLength(1)
  password!: string;

  /** true = full database restore; false = restore only the given modules. */
  @IsBoolean()
  full!: boolean;

  /** Module ids to restore when `full` is false. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];
}
