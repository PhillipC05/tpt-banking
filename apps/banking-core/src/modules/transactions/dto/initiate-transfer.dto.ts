import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  Matches,
  MinLength,
  IsOptional,
  Length,
} from 'class-validator';

export class InitiateTransferDto {
  @ApiProperty({ description: 'Source account UUID' })
  @IsUUID()
  sourceAccountId!: string;

  @ApiProperty({ description: 'Destination account UUID' })
  @IsUUID()
  destinationAccountId!: string;

  @ApiProperty({ description: 'Amount as decimal string', example: '500.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,6})?$/, { message: 'Amount must be a positive decimal string' })
  amount!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({ example: 'Rent payment' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Unique key to prevent duplicate transfers' })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
