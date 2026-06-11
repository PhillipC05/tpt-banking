import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import {
  IsArray, IsNumber, IsOptional, IsPositive, Max, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CvaService } from './cva.service';

class ExposureProfileDto {
  @IsNumber() @Min(0) time!: number;
  @IsNumber() @Min(0) expectedExposure!: number;
}

class DiscountPointDto {
  @IsNumber() @IsPositive() time!: number;
  @IsNumber() rate!: number;
}

class CvaDto {
  @IsNumber() @IsPositive() cdsSpreads!: number;
  @IsNumber() @Min(0) @Max(1) recoveryRate!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExposureProfileDto) @ArrayMinSize(2)
  exposureProfile!: ExposureProfileDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => DiscountPointDto) @ArrayMinSize(1)
  discountCurve!: DiscountPointDto[];
}

class BilatCvaDto extends CvaDto {
  @IsNumber() @IsPositive() ownCdsSpread!: number;
  @IsNumber() @Min(0) @Max(1) ownRecoveryRate!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExposureProfileDto) @ArrayMinSize(2)
  ownExposureProfile!: ExposureProfileDto[];
}

class MonteCarloCvaDto {
  @IsNumber() @IsPositive() notional!: number;
  @IsNumber() fixedRate!: number;
  @IsNumber() marketRate!: number;
  @IsNumber() @IsPositive() rateVolatility!: number;
  @IsNumber() @IsPositive() maturityYears!: number;
  @IsNumber() @IsPositive() frequency!: number;
  @IsNumber() @IsPositive() cdsSpreads!: number;
  @IsNumber() @Min(0) @Max(1) recoveryRate!: number;
  @IsNumber() riskFreeRate!: number;
  @IsOptional() @IsNumber() @IsPositive() @Max(50_000) numSimulations?: number;
}

@ApiTags('Risk — CVA')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('risk/cva')
export class CvaController {
  constructor(private readonly cvaService: CvaService) {}

  @Post('analytical')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Analytical CVA — semi-analytical using discretised exposure profile',
    description:
      'CVA = (1-R) × ∑ EE(tᵢ) × ΔPD(tᵢ) × DF(tᵢ). ' +
      'Hazard rate extracted from CDS spread. Returns CVA in dollars and basis points.',
  })
  analytical(@Body() dto: CvaDto) {
    return this.cvaService.computeCva(dto);
  }

  @Post('bilateral')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Bilateral CVA = CVA - DVA',
    description:
      'Computes CVA (counterparty default risk) and DVA (own default benefit). ' +
      'Bilateral CVA = CVA - DVA. Also returns simplified FVA (funding valuation adjustment).',
  })
  bilateral(@Body() dto: BilatCvaDto) {
    return this.cvaService.computeBilateralCva(dto);
  }

  @Post('monte-carlo')
  @Roles(Role.RISK_MANAGER, Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Monte Carlo CVA for Interest Rate Swap',
    description:
      'Simulates rate paths using a Normal (Bachelier) model, computes IRS mark-to-market ' +
      'at each payment date, derives Expected Positive Exposure, and integrates CVA. ' +
      'Returns 95% confidence interval. Default 5,000 simulations (max 50,000).',
  })
  monteCarlo(@Body() dto: MonteCarloCvaDto) {
    return this.cvaService.computeMonteCarloCva(dto);
  }
}
