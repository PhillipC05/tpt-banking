import { Controller, Get, Post, Body, Param, Headers, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import { FdxService } from './fdx.service';

/**
 * FDX (Financial Data Exchange) API v6.0 — US Open Banking standard.
 *
 * Implements the FDX API for:
 *   - Account summaries
 *   - Account details
 *   - Transactions
 *   - Consent management (FDX Consent API)
 *
 * Uses FDX data elements: FdxAccounts, FdxTransactions, FdxConsent.
 */
@ApiTags('FDX — Financial Data Exchange v6')
@Controller('fdx/v6')
export class FdxController {
  constructor(private readonly fdxService: FdxService) {}

  // ─── Consent ─────────────────────────────────────────────────────────────

  @Post('consents')
  @ApiOperation({ summary: 'Create FDX consent — FDX Consent API v6' })
  createConsent(
    @Headers('authorization') authorization: string,
    @Body() body: {
      dataClusters: string[];
      lookbackPeriod?: number;
      expirationDate?: string;
      resources?: Array<{ resourceType: string; resourceIds: string[] }>;
    },
  ) {
    return this.fdxService.createConsent(authorization, body);
  }

  @Get('consents/:consentId')
  @ApiOperation({ summary: 'Get FDX consent status' })
  getConsent(@Param('consentId') consentId: string) {
    return this.fdxService.getConsent(consentId);
  }

  @Post('consents/:consentId/revocation')
  @ApiOperation({ summary: 'Revoke FDX consent' })
  revokeConsent(
    @Param('consentId') consentId: string,
    @Body() body: { reason: string },
  ) {
    return this.fdxService.revokeConsent(consentId, body.reason);
  }

  // ─── Accounts ────────────────────────────────────────────────────────────

  @Get('accounts')
  @ApiOperation({ summary: 'Get all accounts — FDX AccountSummary' })
  getAccounts(@Headers('authorization') authorization: string) {
    return this.fdxService.getAccounts(authorization);
  }

  @Get('accounts/:accountId')
  @ApiOperation({ summary: 'Get account details — FDX AccountDetail' })
  getAccount(
    @Param('accountId') accountId: string,
    @Headers('authorization') authorization: string,
  ) {
    return this.fdxService.getAccount(authorization, accountId);
  }

  @Get('accounts/:accountId/transactions')
  @ApiOperation({ summary: 'Get account transactions — FDX Transaction' })
  getTransactions(
    @Param('accountId') accountId: string,
    @Headers('authorization') authorization: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('offset') offset = 0,
    @Query('limit') limit = 50,
  ) {
    return this.fdxService.getTransactions(authorization, accountId, startDate, endDate, +offset, +limit);
  }

  // ─── Payments (FDX Payments extension) ───────────────────────────────────

  @Post('payments')
  @ApiOperation({ summary: 'Initiate a payment — FDX Payments extension' })
  initiatePayment(
    @Headers('authorization') authorization: string,
    @Body() body: {
      paymentType: string;
      amount: { currencyCode: string; value: string };
      debtorAccount: { accountId: string };
      creditorAccount: { accountNumber: string; routingNumber: string };
      memo?: string;
    },
  ) {
    return this.fdxService.initiatePayment(authorization, body);
  }
}
