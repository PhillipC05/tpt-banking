import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class OpenCollectionCaseDto {
  @ApiProperty({ description: 'Loan ID that is delinquent' })
  @IsUUID()
  loanId!: string;

  @ApiProperty({ description: 'Customer ID' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ description: 'Number of days the loan is overdue' })
  @IsNumber()
  @Min(1)
  daysOverdue!: number;

  @ApiProperty({ description: 'Total overdue amount' })
  @IsNumber()
  @Min(0)
  amountOverdue!: number;

  @ApiProperty({ description: 'Number of missed payments' })
  @IsNumber()
  @Min(1)
  missedPayments!: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
