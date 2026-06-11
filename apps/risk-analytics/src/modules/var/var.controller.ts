import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import {
  IsArray, IsNumber, IsOptional, IsPositive, Max, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VarService } from './var.service';

class HistoricalVarDto {
  @IsArray() @ArrayMinSize(10) @IsNumber({}, { each: true })
  @ApiProperty({ description: 'Historical daily P&L values (absolute dollar changes)', example: [-5000, 2000, -8000] })
  historicalPnL!: number[];

  @IsNumber() @Min(0.9) @Max(0.9999)
  @ApiProperty({ description: 'Confidence level e.g. 0.99 = 99%', example: 0.99 })
  confidenceLevel!: number;

  @IsNumber() @IsPositive()
  @ApiProperty({ description: 'Holding period in trading days', example: 1 })
  holdingPeriodDays!: number;

  @IsNumber() @IsPositive()
  @ApiProperty({ description: 'Current portfolio market value', example: 1_000_000 })
  portfolioValue!: number;
}

class ParametricVarDto {
  @IsNumber() @IsPositive() portfolioValue!: number;
  @IsNumber() annualisedReturn!: number;
  @IsNumber() @IsPositive() annualisedVolatility!: number;
  @IsNumber() @Min(0.9) @Max(0.9999) confidenceLevel!: number;
  @IsNumber() @IsPositive() holdingPeriodDays!: number;
}

class PortfolioPositionDto {
  @ApiProperty({ example: 'AAPL' }) symbol!: string;
  @IsNumber() value!: number;
  @IsNumber() @IsPositive() annualisedVolatility!: number;
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) historicalReturns?: number[];
}

class MonteCarloVarDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PortfolioPositionDto)
  @ArrayMinSize(1)
  positions!: PortfolioPositionDto[];

  @IsOptional() @IsArray() correlationMatrix?: number[][];
  @IsNumber() @Min(0.9) @Max(0.9999) confidenceLevel!: number;
  @IsNumber() @IsPositive() holdingPeriodDays!: number;
  @IsOptional() @IsNumber() @IsPositive() @Max(100_000) numSimulations?: number;
}

@ApiTags('Risk — VaR')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('risk/var')
export class VarController {
  constructor(private readonly varService: VarService) {}

  @Post('historical')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Historical Simulation VaR + CVaR',
    description:
      'Non-parametric VaR using empirical P&L distribution. ' +
      'Also returns CVaR (Expected Shortfall). Square-root-of-time scaling for multi-day horizons.',
  })
  historicalVar(@Body() dto: HistoricalVarDto) {
    return this.varService.historicalVar(dto);
  }

  @Post('parametric')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Parametric (Variance-Covariance) VaR + CVaR',
    description:
      'Assumes normally distributed returns. ' +
      'VaR = -(μ_hp - z_α × σ_hp) where hp denotes the holding period.',
  })
  parametricVar(@Body() dto: ParametricVarDto) {
    return this.varService.parametricVar(dto);
  }

  @Post('monte-carlo')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Monte Carlo VaR + CVaR with component decomposition',
    description:
      'GBM simulation with Cholesky-decomposed correlation. ' +
      'Returns portfolio VaR, CVaR, per-position component VaR, and diversification benefit. ' +
      'Default 10,000 simulations (max 100,000).',
  })
  monteCarloVar(@Body() dto: MonteCarloVarDto) {
    return this.varService.monteCarloVar(dto);
  }
}
