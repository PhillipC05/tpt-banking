import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JournalType, LedgerEntryType } from '@tpt/database';

export class LedgerEntryInputDto {
  @ApiProperty({ description: 'Account ID to debit or credit' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ enum: LedgerEntryType })
  @IsEnum(LedgerEntryType)
  type!: LedgerEntryType;

  @ApiProperty({ description: 'Amount as decimal string (e.g. "100.00")', example: '100.000000' })
  @IsString()
  @Matches(/^\d+(\.\d{1,6})?$/, { message: 'Amount must be a positive decimal string' })
  amount!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ example: 'Transfer out' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PostJournalDto {
  @ApiProperty({ example: 'Funds transfer between accounts' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty({ enum: JournalType })
  @IsEnum(JournalType)
  type!: JournalType;

  @ApiPropertyOptional({ description: 'External reference (payment ID, wire ref)' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Idempotency key to prevent duplicate postings' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({ type: [LedgerEntryInputDto], description: 'At least 2 entries (debit + credit)' })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LedgerEntryInputDto)
  entries!: LedgerEntryInputDto[];
}
