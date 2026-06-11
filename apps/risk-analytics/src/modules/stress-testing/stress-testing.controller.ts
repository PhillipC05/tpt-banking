import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import {
  IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StressTestingService, PortfolioExposure, RiskFactorShock } from './stress-testing.service';

class RiskFactorShockDto implements RiskFactorShock {
  @IsString() factor!: string;
  @IsOptional() @IsNumber() shockAbsolute?: number;
  @IsOptional() @IsNumber() shockRelative?: number;
}

class PortfolioExposureDto implements PortfolioExposure {
  @IsString() factor!: string;
  @IsNumber() dollarSensitivity!: number;
  @IsOptional() @IsNumber() marketValue?: number;
}

class CustomStressDto {
  @IsString() scenarioName!: string;
  @IsString() scenarioDescription!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RiskFactorShockDto) shocks!: RiskFactorShockDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => PortfolioExposureDto) exposures!: PortfolioExposureDto[];
  @IsNumber() portfolioValue!: number;
}

class CcarStressDto {
  @IsEnum(['SEVERELY_ADVERSE', 'ADVERSE', 'BASELINE'])
  @ApiProperty({ enum: ['SEVERELY_ADVERSE', 'ADVERSE', 'BASELINE'] })
  scenario!: 'SEVERELY_ADVERSE' | 'ADVERSE' | 'BASELINE';

  @IsArray() @ValidateNested({ each: true }) @Type(() => PortfolioExposureDto)
  @ArrayMinSize(1)
  exposures!: PortfolioExposureDto[];

  @IsNumber() portfolioValue!: number;
}

class AllCcarDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PortfolioExposureDto)
  @ArrayMinSize(1)
  exposures!: PortfolioExposureDto[];

  @IsNumber() portfolioValue!: number;
}

class BatchStressDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CustomStressDto)
  @ArrayMinSize(1)
  scenarios!: CustomStressDto[];
}

@ApiTags('Risk — Stress Testing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('risk/stress')
export class StressTestingController {
  constructor(private readonly stressService: StressTestingService) {}

  @Get('ccar/scenarios')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ANALYST, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get CCAR scenario definitions (shocks per risk factor)' })
  getCcarScenarios() {
    return this.stressService.getCcarScenarioDefinitions();
  }

  @Post('custom')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Run custom stress scenario',
    description:
      'Apply user-defined risk factor shocks to portfolio sensitivities. ' +
      'Supports absolute (e.g. +200bps) and relative (e.g. -30%) shocks.',
  })
  runCustom(@Body() dto: CustomStressDto) {
    return this.stressService.runCustomScenario(dto);
  }

  @Post('ccar')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Run single CCAR regulatory scenario',
    description:
      'Apply Fed CCAR 2024 scenario shocks (Severely Adverse, Adverse, or Baseline) ' +
      'to portfolio exposures.',
  })
  runCcar(@Body() dto: CcarStressDto) {
    return this.stressService.runCcarScenario(dto);
  }

  @Post('ccar/all')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Run all three CCAR scenarios in one call',
    description:
      'Runs Baseline, Adverse, and Severely Adverse CCAR scenarios. ' +
      'Returns all results plus worst-case scenario identification.',
  })
  runAllCcar(@Body() dto: AllCcarDto) {
    return this.stressService.runAllCcarScenarios(dto.exposures, dto.portfolioValue);
  }

  @Post('batch')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Run multiple custom scenarios in batch',
    description: 'Execute a batch of custom stress scenarios and identify the worst outcome.',
  })
  runBatch(@Body() dto: BatchStressDto) {
    return this.stressService.runBatch(dto.scenarios);
  }
}
