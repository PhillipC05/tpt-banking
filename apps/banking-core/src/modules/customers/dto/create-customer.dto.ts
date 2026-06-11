import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { CustomerTier } from '@tpt/database';

export class CreateCustomerDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiPropertyOptional({ example: 'Michael' })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty({ example: '1985-06-15', description: 'Date of birth (YYYY-MM-DD)' })
  @IsDateString()
  dateOfBirth!: string;

  @ApiPropertyOptional({ example: '+12125551234' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'USA', description: 'ISO 3166-1 alpha-3 nationality code' })
  @IsString()
  @Length(3, 3)
  nationality!: string;

  @ApiPropertyOptional({ example: '123-45-6789', description: 'Tax ID or SSN (last 4 stored in plaintext, full value encrypted)' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ enum: CustomerTier, default: CustomerTier.RETAIL })
  @IsOptional()
  @IsEnum(CustomerTier)
  tier?: CustomerTier;
}
