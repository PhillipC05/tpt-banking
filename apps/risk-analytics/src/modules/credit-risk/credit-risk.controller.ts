import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import {
  IsEnum, IsNumber, IsOptional, IsPositive, Max, Min,
} from 'class-validator';
import { CreditRiskService } from './credit-risk.service';

class AltmanZDto {
  @IsNumber() workingCapital!: number;
  @IsNumber() @IsPositive() totalAssets!: number;
  @IsNumber() retainedEarnings!: number;
  @IsNumber() ebit!: number;
  @IsNumber() @IsPositive() marketValueEquity!: number;
  @IsNumber() @IsPositive() bookValueLiabilities!: number;
  @IsNumber() @IsPositive() netSales!: number;
  @IsEnum(['public', 'private', 'nonManufacturing'])
  @ApiProperty({ enum: ['public', 'private', 'nonManufacturing'], description: 'Determines Altman model variant' })
  entityType!: 'public' | 'private' | 'nonManufacturing';
}

class MertonModelDto {
  @IsNumber() @IsPositive() equityValue!: number;
  @IsNumber() @IsPositive() equityVolatility!: number;
  @IsNumber() @IsPositive() debtFaceValue!: number;
  @IsNumber() riskFreeRate!: number;
  @IsNumber() @IsPositive() debtMaturityYears!: number;
}

class ExpectedLossDto {
  @IsNumber() @Min(0.00001) @Max(0.9999) probabilityOfDefault!: number;
  @IsNumber() @Min(0) @Max(1) lossGivenDefault!: number;
  @IsNumber() @IsPositive() exposureAtDefault!: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) maturityYears?: number;
}

class RetailCreditDto {
  @IsNumber() @Min(300) @Max(850) creditScore!: number;
  @IsNumber() @Min(0) @Max(2) debtToIncome!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(2) loanToValue?: number;
  @IsOptional() @IsNumber() @Min(0) monthsSinceDelinquency?: number;
  @IsOptional() @IsNumber() @Min(0) recentInquiries?: number;
  @IsEnum(['mortgage', 'auto', 'personal', 'creditCard', 'business'])
  productType!: 'mortgage' | 'auto' | 'personal' | 'creditCard' | 'business';
}

@ApiTags('Risk — Credit')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('risk/credit')
export class CreditRiskController {
  constructor(private readonly creditService: CreditRiskService) {}

  @Post('altman-z')
  @Roles(Role.CREDIT_ANALYST, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Altman Z-Score — corporate credit distress prediction',
    description:
      'Supports three model variants: Original (1968) for public manufacturers, ' +
      "Z'Score (1983) for private firms, Z''Score (1995) for non-manufacturing/services. " +
      'Returns Z-score, credit rating estimate, PD, and ratio decomposition.',
  })
  altmanZ(@Body() dto: AltmanZDto) {
    return this.creditService.altmanZScore(dto);
  }

  @Post('merton')
  @Roles(Role.CREDIT_ANALYST, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Merton Structural Model — option-theoretic PD',
    description:
      'Solves for implied asset value and asset volatility from equity market data. ' +
      'Computes distance-to-default, risk-neutral PD, real-world PD, and implied credit spread.',
  })
  mertonModel(@Body() dto: MertonModelDto) {
    return this.creditService.mertonModel(dto);
  }

  @Post('expected-loss')
  @Roles(Role.CREDIT_ANALYST, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Basel III Expected Loss + Economic Capital',
    description:
      'Computes EL = PD × LGD × EAD, unexpected loss at 99.9% confidence (Basel ASRF), ' +
      'risk-weighted assets, and 8% regulatory capital requirement.',
  })
  expectedLoss(@Body() dto: ExpectedLossDto) {
    return this.creditService.expectedLoss(dto);
  }

  @Post('retail-score')
  @Roles(Role.CREDIT_ANALYST, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Retail credit scorecard — FICO-based PD estimate',
    description:
      'Estimates PD for retail products using credit score, DTI, LTV, delinquency history, ' +
      'and inquiries. Returns risk tier (PRIME/NEAR_PRIME/SUBPRIME/DEEP_SUBPRIME) and ' +
      'APPROVE/REVIEW/DECLINE recommendation.',
  })
  retailScore(@Body() dto: RetailCreditDto) {
    return this.creditService.retailCreditScore(dto);
  }
}
