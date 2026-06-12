import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class InitiateEddDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ description: 'Linked CDD assessment ID that triggered EDD' })
  @IsUUID()
  @IsOptional()
  cddAssessmentId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class SubmitQuestionnaireDto {
  @ApiProperty({ description: 'Customer responses to the enhanced questionnaire' })
  @IsObject()
  questionnaireData!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'PEP details if the customer is a politically exposed person' })
  @IsObject()
  @IsOptional()
  pepDetails?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Adverse media details from re-screening' })
  @IsObject()
  @IsOptional()
  adverseMediaDetails?: Record<string, unknown>;
}

export class SeniorManagerApprovalDto {
  @ApiProperty({ description: 'UUID of the senior manager approving' })
  @IsUUID()
  managerId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
