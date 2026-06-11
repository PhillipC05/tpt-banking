import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InterestRateRiskService, RateSensitiveInstrument } from './interest-rate-risk.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Interest Rate Risk')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('interest-rate-risk')
export class InterestRateRiskController {
  constructor(private readonly irrService: InterestRateRiskService) {}

  @Post('repricing-gap')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Repricing gap analysis across Basel IRRBB time buckets' })
  computeRepricingGap(@Body() body: { instruments: RateSensitiveInstrument[] }) {
    return this.irrService.computeRepricingGap(body.instruments);
  }

  @Post('nii-sensitivity')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'NII sensitivity across 6 Basel IRRBB interest rate shock scenarios' })
  computeNiiSensitivity(
    @Body() body: { instruments: RateSensitiveInstrument[]; horizonYears?: number },
  ) {
    return this.irrService.computeNiiSensitivity(body.instruments, body.horizonYears ?? 1);
  }

  @Post('duration-gap')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Duration gap, EVE, and EVE sensitivity (+/-200bps)' })
  computeDurationGap(
    @Body() body: { instruments: RateSensitiveInstrument[]; marketRate?: number },
  ) {
    return this.irrService.computeDurationGap(body.instruments, body.marketRate ?? 0.05);
  }

  @Post('basis-risk')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Basis risk assessment across reference rate mismatches (SOFR, Prime, EURIBOR etc.)' })
  assessBasisRisk(
    @Body() body: {
      positions: Array<{
        referenceRate: string;
        notional: number;
        isAsset: boolean;
        currentRate: number;
      }>;
    },
  ) {
    return this.irrService.assessBasisRisk(body.positions);
  }
}
