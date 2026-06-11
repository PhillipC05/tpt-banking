import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { LoanType } from '@tpt/database';

export class ApplyForLoanDto {
  @ApiProperty({ enum: LoanType })
  @IsEnum(LoanType)
  type!: LoanType;

  @ApiProperty({ description: 'Requested principal in USD', example: 25000 })
  @IsNumber()
  @IsPositive()
  principalAmount!: number;

  @ApiProperty({ description: 'Requested term in months', example: 60 })
  @IsNumber()
  @Min(6)
  @Max(360)
  termMonths!: number;

  @ApiPropertyOptional({ description: 'Purpose of the loan', example: 'Debt consolidation' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: 'Annual gross income in USD' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  annualIncome?: number;

  @ApiPropertyOptional({ description: 'Monthly debt obligations in USD' })
  @IsOptional()
  @IsNumber()
  monthlyDebtObligations?: number;

  @ApiPropertyOptional({ description: 'Collateral description (required for secured loans)' })
  @IsOptional()
  @IsString()
  collateralDescription?: string;

  @ApiPropertyOptional({ description: 'Estimated collateral value' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  collateralValue?: number;
}
