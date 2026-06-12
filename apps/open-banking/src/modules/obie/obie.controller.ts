import { Controller, Get, Post, Body, Param, Headers, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ObieService } from './obie.service';
import { JwtAuthGuard } from '@tpt/auth';

/**
 * UK Open Banking Implementation Entity (OBIE) v3.1 APIs.
 *
 * Implements:
 *   - Account and Transaction API (AISP) — v3.1.10
 *   - Payment Initiation API (PISP) — v3.1.10
 *
 * All endpoints require an OAuth2 Bearer token with the appropriate scope.
 * Consent must be in AUTHORISED status.
 */
@ApiTags('UK Open Banking — OBIE v3.1')
@ApiBearerAuth('access-token')
@Controller('open-banking/v3.1')
export class ObieController {
  constructor(private readonly obieService: ObieService) {}

  // ─── Account Information (AISP) ──────────────────────────────────────────

  @Post('aisp/account-access-consents')
  @ApiOperation({
    summary: 'Create Account Access Consent — OBIE AISP',
    description: 'Creates consent for AISP to access account information. Returns consentId for authorization flow.',
  })
  createAccountConsent(
    @Headers('authorization') authorization: string,
    @Body() body: {
      Data: { Permissions: string[]; ExpirationDateTime?: string; TransactionFromDateTime?: string; TransactionToDateTime?: string };
      Risk: Record<string, unknown>;
    },
  ) {
    return this.obieService.createAccountConsent(authorization, body);
  }

  @Get('aisp/account-access-consents/:consentId')
  @ApiOperation({ summary: 'Get Account Access Consent status — OBIE AISP' })
  getAccountConsent(@Param('consentId') consentId: string) {
    return this.obieService.getConsentStatus(consentId);
  }

  @Get('aisp/accounts')
  @ApiOperation({ summary: 'Get list of accounts — OBIE AISP (requires ReadAccountsBasic)' })
  getAccounts(@Headers('authorization') authorization: string) {
    return this.obieService.getAccounts(authorization);
  }

  @Get('aisp/accounts/:accountId')
  @ApiOperation({ summary: 'Get account details — OBIE AISP (requires ReadAccountsDetail)' })
  getAccount(
    @Headers('authorization') authorization: string,
    @Param('accountId') accountId: string,
  ) {
    return this.obieService.getAccount(authorization, accountId);
  }

  @Get('aisp/accounts/:accountId/balances')
  @ApiOperation({ summary: 'Get account balances — OBIE AISP (requires ReadBalances)' })
  getBalances(
    @Headers('authorization') authorization: string,
    @Param('accountId') accountId: string,
  ) {
    return this.obieService.getBalances(authorization, accountId);
  }

  @Get('aisp/accounts/:accountId/transactions')
  @ApiOperation({ summary: 'Get transactions — OBIE AISP (requires ReadTransactionsDetail)' })
  getTransactions(
    @Headers('authorization') authorization: string,
    @Param('accountId') accountId: string,
    @Query('fromBookingDateTime') from?: string,
    @Query('toBookingDateTime') to?: string,
  ) {
    return this.obieService.getTransactions(authorization, accountId, from, to);
  }

  // ─── Payment Initiation (PISP) ────────────────────────────────────────────

  @Post('pisp/domestic-payment-consents')
  @ApiOperation({
    summary: 'Create Domestic Payment Consent — OBIE PISP',
    description: 'Creates consent to initiate a domestic payment. PSU must authorise before payment can be submitted.',
  })
  createPaymentConsent(
    @Headers('authorization') authorization: string,
    @Body() body: {
      Data: {
        Initiation: {
          InstructionIdentification: string;
          EndToEndIdentification: string;
          InstructedAmount: { Amount: string; Currency: string };
          CreditorAccount: { SchemeName: string; Identification: string; Name: string };
          RemittanceInformation?: { Unstructured?: string };
        };
      };
      Risk: Record<string, unknown>;
    },
  ) {
    return this.obieService.createPaymentConsent(authorization, body);
  }

  @Post('pisp/domestic-payments')
  @ApiOperation({
    summary: 'Submit Domestic Payment — OBIE PISP',
    description: 'Submits a domestic payment using an AUTHORISED payment consent.',
  })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  submitPayment(
    @Headers('authorization') authorization: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() body: {
      Data: {
        ConsentId: string;
        Initiation: Record<string, unknown>;
      };
      Risk: Record<string, unknown>;
    },
  ) {
    return this.obieService.submitPayment(authorization, idempotencyKey, body);
  }

  @Get('pisp/domestic-payments/:domesticPaymentId')
  @ApiOperation({ summary: 'Get domestic payment status — OBIE PISP' })
  getPaymentStatus(@Param('domesticPaymentId') paymentId: string) {
    return this.obieService.getPaymentStatus(paymentId);
  }

  // ── Confirmation of Funds (CBPII / PSD2 Art.65) ───────────────────────────

  @Post('cbpii/funds-confirmations')
  @ApiOperation({
    summary: 'Confirm funds availability — OBIE CBPII (PSD2 Art.65)',
    description: 'Returns FundsAvailable: true/false. Requires ReadFundsConfirmations permission on consent.',
  })
  confirmFunds(
    @Headers('authorization') authorization: string,
    @Body() body: {
      Data: {
        ConsentId:        string;
        Reference:        string;
        InstructedAmount: { Amount: string; Currency: string };
      };
    },
  ) {
    return this.obieService.confirmFunds(authorization, body);
  }
}
