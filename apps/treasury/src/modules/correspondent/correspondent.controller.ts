import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CorrespondentService, CorrespondentBank, MessageType, MessageStatus, ServiceType, SwiftMessage } from './correspondent.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Correspondent Banking')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('correspondent')
export class CorrespondentController {
  constructor(private readonly correspondentService: CorrespondentService) {}

  // ── Bank relationship management ──────────────────────────────────────────

  @Post('banks')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add a correspondent bank (KYC must be pre-approved)' })
  addCorrespondent(
    @Body() body: Omit<CorrespondentBank, 'bankId' | 'currentExposure' | 'onboardedDate'>,
  ) {
    return this.correspondentService.addCorrespondent(body);
  }

  @Get('banks')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all correspondent banks with optional filters' })
  @ApiQuery({ name: 'status', required: false, example: 'ACTIVE' })
  @ApiQuery({ name: 'service', required: false, example: 'USD_CLEARING' })
  @ApiQuery({ name: 'country', required: false, example: 'US' })
  getAllCorrespondents(
    @Query('status') status?: string,
    @Query('service') service?: ServiceType,
    @Query('country') country?: string,
  ) {
    return this.correspondentService.getAllCorrespondents({ status, service, country });
  }

  @Get('banks/network-summary')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Correspondent banking network summary — exposure, KYC status, coverage' })
  getNetworkSummary() {
    return this.correspondentService.getNetworkSummary();
  }

  @Get('banks/bic/:bic')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Look up a correspondent by SWIFT BIC' })
  findByBIC(@Param('bic') bic: string) {
    return this.correspondentService.findByBIC(bic);
  }

  @Get('banks/:bankId')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get correspondent bank details' })
  getCorrespondent(@Param('bankId') bankId: string) {
    return this.correspondentService.getCorrespondent(bankId);
  }

  @Post('banks/:bankId/kyc')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update KYC status for a correspondent bank' })
  updateKyc(
    @Param('bankId') bankId: string,
    @Body() body: { status: CorrespondentBank['kycStatus']; expiryDate?: string },
  ) {
    return this.correspondentService.updateKycStatus(bankId, body.status, body.expiryDate);
  }

  @Post('banks/:bankId/credit-limit')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update credit limit for a correspondent bank' })
  updateCreditLimit(
    @Param('bankId') bankId: string,
    @Body() body: { creditLimit: number },
  ) {
    return this.correspondentService.updateCreditLimit(bankId, body.creditLimit);
  }

  // ── SWIFT messaging ────────────────────────────────────────────────────────

  @Post('messages')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a SWIFT message (MT103/MT202/MT760 etc.) — queued for sending' })
  createMessage(
    @Body() body: {
      bankId: string;
      messageType: MessageType;
      direction: 'OUTBOUND' | 'INBOUND';
      senderBIC: string;
      receiverBIC: string;
      relatedReference: string;
      valueDate: string;
      currency: string;
      amount: number;
      chargeCode: SwiftMessage['chargeCode'];
      rawContent: string;
    },
  ) {
    return this.correspondentService.createMessage(body);
  }

  @Post('messages/:messageId/send')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Send a queued SWIFT message' })
  sendMessage(@Param('messageId') messageId: string) {
    return this.correspondentService.sendMessage(messageId);
  }

  @Post('messages/:messageId/acknowledge')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark a SWIFT message as acknowledged (SWIFT gpi confirmation)' })
  acknowledgeMessage(
    @Param('messageId') messageId: string,
    @Body() body: { gpiStatus?: string },
  ) {
    return this.correspondentService.acknowledgeMessage(messageId, body.gpiStatus);
  }

  @Get('messages')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List SWIFT messages with optional bank/status filter' })
  @ApiQuery({ name: 'bankId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'QUEUED', 'SENT', 'ACKNOWLEDGED', 'REJECTED', 'PENDING_RESPONSE'] })
  getMessages(
    @Query('bankId') bankId?: string,
    @Query('status') status?: MessageStatus,
  ) {
    return this.correspondentService.getMessages(bankId, status);
  }

  @Get('messages/:messageId')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get SWIFT message details by ID' })
  getMessage(@Param('messageId') messageId: string) {
    return this.correspondentService.getMessage(messageId);
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  @Post('routing/compute')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Compute optimal correspondent banking route for a currency payment' })
  computeOptimalRoute(
    @Body() body: { currency: string; amount: number; beneficiaryBIC: string },
  ) {
    return this.correspondentService.computeOptimalRoute(body);
  }
}
