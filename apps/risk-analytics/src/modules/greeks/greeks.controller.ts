import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import {
  IsArray, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Max, Min,
  ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PortfolioGreeksService, OptionPosition } from './portfolio-greeks.service';

class OptionPositionDto implements OptionPosition {
  @IsString() symbol!: string;
  @IsNumber() quantity!: number;
  @IsNumber() @IsPositive() spot!: number;
  @IsNumber() @IsPositive() strike!: number;
  @IsNumber() riskFreeRate!: number;
  @IsNumber() @Min(0) dividendYield!: number;
  @IsNumber() @IsPositive() @Max(5) volatility!: number;
  @IsNumber() @Min(0) timeToExpiry!: number;
  @IsEnum(['call', 'put']) optionType!: 'call' | 'put';
  @IsOptional() @IsNumber() @IsPositive() multiplier?: number;
}

class PortfolioGreeksDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => OptionPositionDto)
  @ArrayMinSize(1)
  positions!: OptionPositionDto[];
}

@ApiTags('Risk — Greeks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('risk/greeks')
export class GreeksController {
  constructor(private readonly greeksService: PortfolioGreeksService) {}

  @Post('portfolio')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Compute portfolio-level Greeks (Delta, Gamma, Vega, Theta, Rho)',
    description:
      'Aggregates BSM Greeks across a mixed portfolio of long/short calls and puts. ' +
      'Returns unit Greeks per position and dollar Greeks scaled by quantity × multiplier. ' +
      'Also computes DV01, vega P01, daily theta decay, and delta-hedge notional.',
  })
  portfolioGreeks(@Body() dto: PortfolioGreeksDto) {
    return this.greeksService.computePortfolioGreeks(dto.positions);
  }

  @Post('position')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Compute Greeks for a single option position',
    description: 'Returns full BSM Greeks: Delta, Gamma, Vega, Theta, Rho (unit and dollar).',
  })
  positionGreeks(@Body() dto: OptionPositionDto) {
    return this.greeksService.computePositionGreeks(dto);
  }
}
