import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { AccountType } from '@tpt/database';

export class CreateAccountDto {
  @ApiProperty({ description: 'Customer ID (UUID)' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ enum: AccountType, example: AccountType.CHECKING })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiPropertyOptional({ example: 'USD', default: 'USD', description: 'ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  currency?: string;
}
