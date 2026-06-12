import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CddSourceOfFunds } from '@tpt/database';

export class InitiateCddDto {
  @ApiProperty({ description: 'Customer ID to assess' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ enum: CddSourceOfFunds })
  @IsEnum(CddSourceOfFunds)
  @IsOptional()
  sourceOfFunds?: CddSourceOfFunds;

  @ApiPropertyOptional({ description: 'Narrative description of source of wealth' })
  @IsString()
  @IsOptional()
  sourceOfWealth?: string;

  @ApiPropertyOptional({ description: 'Nature / industry of business (for corporate customers)' })
  @IsString()
  @IsOptional()
  businessNature?: string;

  @ApiPropertyOptional({ description: 'UBO beneficial owners (25%+ ownership stake)', type: [Object] })
  @IsArray()
  @IsOptional()
  beneficialOwners?: Record<string, unknown>[];

  @ApiPropertyOptional({ description: 'Is the customer a politically exposed person?' })
  @IsBoolean()
  @IsOptional()
  politicallyExposed?: boolean;

  @ApiPropertyOptional({ description: 'Adverse media hits from external screening', type: [Object] })
  @IsArray()
  @IsOptional()
  adverseMediaHits?: Record<string, unknown>[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
