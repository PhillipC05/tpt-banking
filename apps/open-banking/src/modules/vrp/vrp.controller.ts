import {
  Controller, Get, Post, Delete, Param, Body, Headers, UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '@tpt/common';
import { VrpService, VrpType, VrpPeriodicLimit } from './vrp.service';

@ApiTags('OBIE Variable Recurring Payments — VRP')
@ApiBearerAuth('access-token')
@Controller('open-banking/v3.1/vrp')
export class VrpController {
  constructor(private readonly vrpService: VrpService) {}

  // ── VRP Consents ──────────────────────────────────────────────────────────

  @Post('domestic-vrp-consents')
  @ApiOperation({
    summary: 'Create VRP consent — OBIE Variable Recurring Payments',
    description: 'Creates a VRP consent defining periodic limits. PSU must authorise before payments can be submitted.',
  })
  createConsent(
    @Body() body: {
      clientId:       string;
      vrpType:        VrpType;
      periodicLimits: VrpPeriodicLimit[];
      validityPeriod: { fromDateTime: string; toDateTime: string };
      debtorAccount?: { schemeName: string; identification: string };
    },
  ) {
    return this.vrpService.createVrpConsent(body);
  }

  @Get('domestic-vrp-consents/:consentId')
  @ApiOperation({ summary: 'Get VRP consent details' })
  getConsent(@Param('consentId') consentId: string) {
    return this.vrpService.getVrpConsent(consentId);
  }

  @Delete('domestic-vrp-consents/:consentId')
  @ApiOperation({ summary: 'Revoke a VRP consent — triggers consent.revoked webhook to TPP' })
  deleteConsent(@Param('consentId') consentId: string) {
    this.vrpService.deleteVrpConsent(consentId);
    return { deleted: true, consentId };
  }

  // ── VRP Payments ──────────────────────────────────────────────────────────

  @Post('domestic-vrps')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Submit a VRP payment — validates against periodic limits',
    description: 'Submits a payment under an AUTHORISED VRP consent. Enforces Day/Week/Month spend limits.',
  })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  submitPayment(
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() body: {
      consentId:       string;
      clientId:        string;
      amount:          string;
      currency:        string;
      creditorAccount: Record<string, unknown>;
      creditorName:    string;
      creditorIban?:   string;
    },
  ) {
    const { consentId, ...params } = body;
    return this.vrpService.submitVrpPayment(consentId, params, idempotencyKey);
  }

  @Get('domestic-vrps/:domesticVrpId')
  @ApiOperation({ summary: 'Get VRP payment details' })
  getPayment(@Param('domesticVrpId') paymentId: string) {
    return this.vrpService.getVrpPayment(paymentId);
  }
}
