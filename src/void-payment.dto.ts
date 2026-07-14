import { IsString, MinLength } from 'class-validator';

export class VoidPaymentDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
