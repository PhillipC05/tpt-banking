import { Controller, Get, Post, Body, Param, Headers, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import { Psd2Service } from './psd2.service';

/**
 * PSD2 / Berlin Group NextGenPSD2 API v1.3
 *
 * Implements the NextGenPSD2 XS2A (Access to Accounts) framework:
 *   - AIS (Account Information Services)
 *   - PIS (Payment Initiation Services)
 *
 * Uses European standard: PSU-ID header, consent-id header, X-Request-ID.
 */
@ApiTags('PSD2 / Berlin Group — NextGenPSD2 v1.3')
@Controller('berlingroup/v1.3')
export class Psd2Controller {
  constructor(private readonly psd2Service: Psd2Service) {}

  // ─── AIS — Consents ───────────────────────────────────────────────────────

  @Post('consents')
  @ApiOperation({
    summary: 'Create AIS Consent — NextGenPSD2',
    description: 'Creates an account information consent. Returns a redirect link for PSU authorisation.',
  })
  @ApiHeader({ name: 'X-Request-ID', required: true, description: 'UUID request identifier' })
  @ApiHeader({ name: 'PSU-ID', required: false, description: 'PSU identifier' })
  createConsent(
    @Headers('x-request-id') requestId: string,
    @Headers('psu-id') psuId: string,
    @Headers('tpp-redirect-uri') tppRedirectUri: string,
    @Body() body: {
      access: { accounts?: string[]; balances?: string[]; transactions?: string[] };
      recurringIndicator: boolean;
      validUntil: string;
      frequencyPerDay: number;
      combinedServiceIndicator: boolean;
    },
  ) {
    return this.psd2Service.createConsent(requestId, psuId, tppRedirectUri, body);
  }

  @Get('consents/:consentId')
  @ApiOperation({ summary: 'Get AIS Consent status — NextGenPSD2' })
  getConsent(
    @Param('consentId') consentId: string,
    @Headers('x-request-id') requestId: string,
  ) {
    return this.psd2Service.getConsent(consentId);
  }

  @Get('consents/:consentId/status')
  @ApiOperation({ summary: 'Get AIS Consent status (status only) — NextGenPSD2' })
  getConsentStatus(@Param('consentId') consentId: string) {
    return this.psd2Service.getConsentStatusOnly(consentId);
  }

  // ─── AIS — Accounts ──────────────────────────────────────────────────────

  @Get('accounts')
  @ApiOperation({ summary: 'Read account list — NextGenPSD2 AIS' })
  @ApiHeader({ name: 'Consent-ID', required: true })
  getAccounts(
    @Headers('consent-id') consentId: string,
    @Headers('authorization') authorization: string,
  ) {
    return this.psd2Service.getAccounts(consentId, authorization);
  }

  @Get('accounts/:accountId/balances')
  @ApiOperation({ summary: 'Read account balances — NextGenPSD2 AIS' })
  @ApiHeader({ name: 'Consent-ID', required: true })
  getBalances(
    @Param('accountId') accountId: string,
    @Headers('consent-id') consentId: string,
  ) {
    return this.psd2Service.getBalances(consentId, accountId);
  }

  @Get('accounts/:accountId/transactions')
  @ApiOperation({ summary: 'Read account transactions — NextGenPSD2 AIS' })
  @ApiHeader({ name: 'Consent-ID', required: true })
  getTransactions(
    @Param('accountId') accountId: string,
    @Headers('consent-id') consentId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('bookingStatus') bookingStatus = 'both',
  ) {
    return this.psd2Service.getTransactions(consentId, accountId, dateFrom, dateTo);
  }

  // ─── PIS — Payment Initiation ────────────────────────────────────────────

  @Post('payments/sepa-credit-transfers')
  @ApiOperation({
    summary: 'Initiate SEPA Credit Transfer — NextGenPSD2 PIS',
    description: 'Creates a payment initiation request. Returns SCA redirect for PSU authorisation.',
  })
  @ApiHeader({ name: 'X-Request-ID', required: true })
  @ApiHeader({ name: 'PSU-ID', required: false })
  initiateSepaCreditTransfer(
    @Headers('x-request-id') requestId: string,
    @Headers('psu-id') psuId: string,
    @Headers('tpp-redirect-uri') tppRedirectUri: string,
    @Body() body: {
      instructedAmount: { currency: string; amount: string };
      debtorAccount: { iban: string };
      creditorName: string;
      creditorAccount: { iban: string };
      creditorAgent?: { bicFi: string };
      remittanceInformationUnstructured?: string;
    },
  ) {
    return this.psd2Service.initiatePayment(requestId, 'sepa-credit-transfers', body);
  }

  @Get('payments/sepa-credit-transfers/:paymentId')
  @ApiOperation({ summary: 'Get payment status — NextGenPSD2 PIS' })
  getPaymentStatus(@Param('paymentId') paymentId: string) {
    return this.psd2Service.getPaymentStatus(paymentId);
  }

  @Get('payments/sepa-credit-transfers/:paymentId/status')
  @ApiOperation({ summary: 'Get payment status (status only) — NextGenPSD2 PIS' })
  getPaymentStatusOnly(@Param('paymentId') paymentId: string) {
    return this.psd2Service.getPaymentStatusOnly(paymentId);
  }
}
