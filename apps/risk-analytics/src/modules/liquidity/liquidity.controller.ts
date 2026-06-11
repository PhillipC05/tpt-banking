import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import {
  IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, Max, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LiquidityService, HqlaItem, CashOutflow, CashInflow, AsfItem, RsfItem } from './liquidity.service';

class HqlaItemDto implements HqlaItem {
  @IsString() description!: string;
  @IsEnum(['LEVEL_1', 'LEVEL_2A', 'LEVEL_2B'])
  @ApiProperty({ enum: ['LEVEL_1', 'LEVEL_2A', 'LEVEL_2B'] })
  level!: 'LEVEL_1' | 'LEVEL_2A' | 'LEVEL_2B';
  @IsNumber() @Min(0) marketValue!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) customHaircut?: number;
}

class CashOutflowDto implements CashOutflow {
  @IsString() category!: any;
  @IsString() description!: string;
  @IsNumber() @Min(0) balance!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) customRunOffRate?: number;
}

class CashInflowDto implements CashInflow {
  @IsString() category!: any;
  @IsString() description!: string;
  @IsNumber() @Min(0) balance!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) customInflowRate?: number;
}

class LcrDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => HqlaItemDto) @ArrayMinSize(1)
  hqlaItems!: HqlaItemDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => CashOutflowDto) @ArrayMinSize(1)
  outflows!: CashOutflowDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => CashInflowDto)
  inflows!: CashInflowDto[];
}

class AsfItemDto implements AsfItem {
  @IsString() category!: any;
  @IsString() description!: string;
  @IsNumber() @Min(0) balance!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) customFactor?: number;
}

class RsfItemDto implements RsfItem {
  @IsString() category!: any;
  @IsString() description!: string;
  @IsNumber() @Min(0) balance!: number;
  @IsOptional() @IsNumber() @Min(0) residualMaturityYears?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) customFactor?: number;
}

class NsfrDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AsfItemDto) @ArrayMinSize(1)
  asfItems!: AsfItemDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => RsfItemDto) @ArrayMinSize(1)
  rsfItems!: RsfItemDto[];
}

@ApiTags('Risk — Liquidity')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('risk/liquidity')
export class LiquidityController {
  constructor(private readonly liquidityService: LiquidityService) {}

  @Get('regulatory-rates')
  @Roles(Role.RISK_MANAGER, Role.COMPLIANCE, Role.ANALYST, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get Basel III LCR and NSFR regulatory rates and factors' })
  getRegulatoryRates() {
    return this.liquidityService.getRegulatoryRates();
  }

  @Post('lcr')
  @Roles(Role.RISK_MANAGER, Role.COMPLIANCE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Compute LCR (Liquidity Coverage Ratio)',
    description:
      'LCR = Adjusted HQLA / Net Cash Outflows (30-day stress) ≥ 100%. ' +
      'Applies Basel III standard haircuts and run-off rates. ' +
      'Enforces HQLA caps (Level 2A ≤ 40%, Level 2B ≤ 15%) and inflow cap (≤ 75% of outflows). ' +
      'Returns detailed breakdown with regulatory notes on cap breaches.',
  })
  computeLcr(@Body() dto: LcrDto) {
    return this.liquidityService.computeLcr(dto.hqlaItems, dto.outflows, dto.inflows);
  }

  @Post('nsfr')
  @Roles(Role.RISK_MANAGER, Role.COMPLIANCE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Compute NSFR (Net Stable Funding Ratio)',
    description:
      'NSFR = Available Stable Funding / Required Stable Funding ≥ 100%. ' +
      'Applies Basel III ASF factors (liabilities/equity) and RSF factors (assets). ' +
      'Maturity-adjusted RSF for short-dated assets. Returns full per-category breakdown.',
  })
  computeNsfr(@Body() dto: NsfrDto) {
    return this.liquidityService.computeNsfr(dto.asfItems, dto.rsfItems);
  }
}
