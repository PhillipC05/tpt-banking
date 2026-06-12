import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { WorkoutPlanType } from '@tpt/database';

export class ProposeWorkoutPlanDto {
  @ApiProperty({ enum: WorkoutPlanType })
  @IsEnum(WorkoutPlanType)
  type!: WorkoutPlanType;

  @ApiPropertyOptional({ description: 'Reduced monthly payment (for forbearance / repayment plans)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  reducedPaymentAmount?: number;

  @ApiPropertyOptional({ description: 'ISO date — plan start (defaults to today)' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO date — plan end' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Plan-type-specific terms (e.g. new interest rate, deferred months)' })
  @IsObject()
  @IsOptional()
  terms?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
