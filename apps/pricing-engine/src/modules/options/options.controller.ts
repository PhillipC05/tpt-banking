import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlackScholesService } from './black-scholes.service';
import { MonteCarloService } from './monte-carlo.service';
import { BinomialTreeService } from './binomial-tree.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import {
  IsEnum, IsNumber, IsOptional, IsPositive, Min, Max,
} from 'class-validator';

class BlackScholesDto {
  @IsNumber() @IsPositive() spot!: number;
  @IsNumber() @IsPositive() strike!: number;
  @IsNumber() riskFreeRate!: number;
  @IsNumber() @Min(0) dividendYield!: number;
  @IsNumber() @IsPositive() @Max(5) volatility!: number;
  @IsNumber() @IsPositive() timeToExpiry!: number;
  @IsEnum(['call', 'put']) optionType!: 'call' | 'put';
}

class ImpliedVolDto extends BlackScholesDto {
  @IsNumber() @IsPositive() marketPrice!: number;
}

class MonteCarloDto extends BlackScholesDto {
  @IsOptional() optionType!: any;
  @IsEnum(['call','put','asian_call','asian_put','barrier_call_up_out','barrier_put_down_out'])
  override optionType!: string;
  @IsOptional() @IsNumber() @IsPositive() numPaths?: number;
  @IsOptional() @IsNumber() @IsPositive() numTimeSteps?: number;
  @IsOptional() @IsNumber() @IsPositive() barrierLevel?: number;
}

class BinomialTreeDto extends BlackScholesDto {
  @IsEnum(['european', 'american']) exerciseType!: 'european' | 'american';
  @IsOptional() @IsNumber() numSteps?: number;
}

@ApiTags('Pricing — Options')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing/options')
export class OptionsController {
  constructor(
    private readonly bsService: BlackScholesService,
    private readonly mcService: MonteCarloService,
    private readonly btService: BinomialTreeService,
  ) {}

  @Post('black-scholes')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Price European option — Black-Scholes-Merton',
    description: 'Returns price + full Greeks (Delta, Gamma, Vega, Theta, Rho, Vanna, Volga) and d1/d2.',
  })
  blackScholes(@Body() dto: BlackScholesDto) {
    return this.bsService.price(dto);
  }

  @Post('black-scholes/chain')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Price entire options chain (multiple strikes)' })
  blackScholesChain(@Body() dto: Omit<BlackScholesDto, 'strike'> & { strikes: number[] }) {
    const { strikes, ...base } = dto;
    return this.bsService.priceChain(strikes, base);
  }

  @Post('black-scholes/implied-vol')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Calculate implied volatility from market price (Newton-Raphson)' })
  impliedVol(@Body() dto: ImpliedVolDto) {
    const { marketPrice, ...params } = dto;
    const { spot, strike, riskFreeRate, dividendYield, timeToExpiry, optionType } = params;
    const iv = this.bsService.impliedVolatility(marketPrice, {
      spot, strike, riskFreeRate, dividendYield, timeToExpiry, optionType,
    });
    return { impliedVolatility: iv, impliedVolatilityPct: (iv * 100).toFixed(4) };
  }

  @Post('monte-carlo')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Price option — Monte Carlo simulation',
    description:
      'Supports European, Asian (arithmetic average), and barrier options. ' +
      'Uses antithetic variates for variance reduction. Returns 95% confidence interval.',
  })
  monteCarlo(@Body() dto: MonteCarloDto) {
    return this.mcService.price(dto as any);
  }

  @Post('binomial-tree')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Price option — CRR Binomial Tree',
    description:
      'Supports both European and American options. ' +
      'American options compute optimal early exercise via backward induction.',
  })
  binomialTree(@Body() dto: BinomialTreeDto) {
    return this.btService.price(dto);
  }
}
