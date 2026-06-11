import {
  Controller, Get, Post, Patch, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  MarginCallService,
  MarginType,
  MarginCallStatus,
  DisputeResolutionMethod,
  SIMMSensitivity,
  AgreementType,
  IMModel,
} from './margin-call.service';

@ApiTags('Margin Calls')
@ApiBearerAuth('access-token')
@Controller('margin')
export class MarginCallController {
  constructor(private readonly svc: MarginCallService) {}

  // ── Agreements ────────────────────────────────────────────────────────────

  @Post('agreements')
  @ApiOperation({ summary: 'Create a margin agreement (CSA/GMRA/GMSLA) with MTA, threshold, IM model' })
  createAgreement(
    @Body() body: {
      counterpartyId: string;
      agreementType: AgreementType;
      currency: string;
      imModel: IMModel;
      minimumTransferAmount: string;
      threshold: string;
      independentAmount: string;
      rounding: string;
      callFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
      settlementLag: number;
      eligibleSchedule: string;
      disputeResolutionDays: number;
      closeOutNetting: boolean;
      effectiveDate: string;
      expiryDate?: string;
    },
  ) {
    return this.svc.createAgreement(body);
  }

  @Get('agreements')
  @ApiOperation({ summary: 'List margin agreements, optionally filtered by counterparty' })
  @ApiQuery({ name: 'counterpartyId', required: false })
  listAgreements(@Query('counterpartyId') counterpartyId?: string) {
    return this.svc.listAgreements(counterpartyId);
  }

  @Get('agreements/:agreementId')
  @ApiOperation({ summary: 'Get a specific margin agreement' })
  getAgreement(@Param('agreementId') agreementId: string) {
    return this.svc.getAgreement(agreementId);
  }

  // ── Exposure calculation ──────────────────────────────────────────────────

  @Post('agreements/:agreementId/exposure')
  @ApiOperation({
    summary: 'Calculate margin exposure: VM (threshold-adjusted), IM (SIMM/SPAN/VaR/Fixed), net call amount after MTA and rounding',
  })
  calculateExposure(
    @Param('agreementId') agreementId: string,
    @Body() body: {
      grossMTM: string;
      collateralHeld: string;
      simmSensitivities?: SIMMSensitivity[];
      spanMarginRequired?: string;
      fixedIMSchedule?: string;
    },
  ) {
    return this.svc.calculateExposure({ agreementId, ...body });
  }

  @Get('agreements/:agreementId/exposures')
  @ApiOperation({ summary: 'List exposure snapshots for an agreement' })
  listExposures(@Param('agreementId') agreementId: string) {
    return this.svc.listExposures(agreementId);
  }

  // ── Margin calls ──────────────────────────────────────────────────────────

  @Post('calls')
  @ApiOperation({ summary: 'Issue a margin call (VM or IM) with automatic due date based on settlement lag' })
  issueCall(
    @Body() body: {
      agreementId: string;
      callType: MarginType;
      callAmount: string;
      notes?: string;
    },
  ) {
    return this.svc.issueMarginCall(body);
  }

  @Get('calls')
  @ApiOperation({ summary: 'List margin calls, optionally filtered by agreement and status' })
  @ApiQuery({ name: 'agreementId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listCalls(
    @Query('agreementId') agreementId?: string,
    @Query('status') status?: MarginCallStatus,
  ) {
    return this.svc.listCalls(agreementId, status);
  }

  @Get('calls/:callId')
  @ApiOperation({ summary: 'Get a specific margin call with all deliveries' })
  getCall(@Param('callId') callId: string) {
    return this.svc.getCall(callId);
  }

  // ── Deliveries & cure ─────────────────────────────────────────────────────

  @Post('calls/:callId/deliver')
  @ApiOperation({ summary: 'Record a collateral delivery against a margin call (partial or full cure)' })
  recordDelivery(
    @Param('callId') callId: string,
    @Body() body: {
      assetType: string;
      amount: string;
      currency: string;
      reference: string;
    },
  ) {
    return this.svc.recordDelivery(callId, body);
  }

  // ── Dispute workflow ──────────────────────────────────────────────────────

  @Post('calls/:callId/dispute')
  @ApiOperation({ summary: 'Open a dispute on a margin call with a reason and resolution method' })
  openDispute(
    @Param('callId') callId: string,
    @Body() body: {
      disputedAmount: string;
      disputeReason: string;
      resolutionMethod: DisputeResolutionMethod;
    },
  ) {
    return this.svc.openDispute(callId, body);
  }

  @Post('calls/:callId/resolve-dispute')
  @ApiOperation({ summary: 'Resolve a disputed call with an agreed amount' })
  resolveDispute(
    @Param('callId') callId: string,
    @Body() body: { agreedAmount: string; notes?: string },
  ) {
    return this.svc.resolveDispute(callId, body);
  }

  // ── Default & cancellation ────────────────────────────────────────────────

  @Post('calls/:callId/default-notice')
  @ApiOperation({ summary: 'Send a default notice for an overdue margin call — transitions to DEFAULTED' })
  sendDefaultNotice(@Param('callId') callId: string) {
    return this.svc.sendDefaultNotice(callId);
  }

  @Post('calls/:callId/cancel')
  @ApiOperation({ summary: 'Cancel a margin call (e.g. after a portfolio compression or novation)' })
  cancelCall(
    @Param('callId') callId: string,
    @Body() body: { reason: string },
  ) {
    return this.svc.cancelCall(callId, body.reason);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Margin call summary: open calls, outstanding, overdue, disputed, defaulted per agreement' })
  @ApiQuery({ name: 'agreementId', required: false })
  getSummary(@Query('agreementId') agreementId?: string) {
    return this.svc.getCallSummary(agreementId);
  }
}
