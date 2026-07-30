import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Patch a single item of a posted report's checklist. The item is addressed by
 * its position in the stored array; `doneAt`/`doneBy` are stamped server-side so
 * the completion date can't be spoofed by the client.
 */
export class UpdateChecklistItemDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  /** An empty/blank string clears the note. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
