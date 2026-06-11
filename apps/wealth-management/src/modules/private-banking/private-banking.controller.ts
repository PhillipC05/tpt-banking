import {
  Controller, Get, Post, Patch, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  PrivateBankingService,
  WealthTier,
  ConciergeRequestType,
} from './private-banking.service';

@ApiTags('Private Banking')
@ApiBearerAuth('access-token')
@Controller('private-banking')
export class PrivateBankingController {
  constructor(private readonly svc: PrivateBankingService) {}

  // ── Clients ──────────────────────────────────────────────────────────────

  @Post('clients')
  @ApiOperation({ summary: 'Onboard a new private banking client with initial AUM' })
  onboardClient(
    @Body() body: { customerId: string; aum: string; notes?: string },
  ) {
    return this.svc.onboardClient(body);
  }

  @Get('clients')
  @ApiOperation({ summary: 'List private banking clients, optionally filtered by tier' })
  @ApiQuery({ name: 'tier', required: false, enum: ['MASS_AFFLUENT', 'HNW', 'VHNW', 'UHNW'] })
  listClients(@Query('tier') tier?: WealthTier) {
    return this.svc.listClients(tier);
  }

  @Get('clients/:clientId')
  @ApiOperation({ summary: 'Get a single private banking client' })
  getClient(@Param('clientId') clientId: string) {
    return this.svc.getClient(clientId);
  }

  @Get('clients/:clientId/dashboard')
  @ApiOperation({ summary: 'Full client dashboard: profile, RM, open requests, fee liability' })
  getClientDashboard(@Param('clientId') clientId: string) {
    return this.svc.getClientDashboard(clientId);
  }

  @Patch('clients/:clientId/aum')
  @ApiOperation({ summary: 'Update client AUM — tier recalculated automatically' })
  updateAUM(
    @Param('clientId') clientId: string,
    @Body() body: { aum: string },
  ) {
    return this.svc.updateAUM(clientId, body.aum);
  }

  @Post('clients/:clientId/assign-rm')
  @ApiOperation({ summary: 'Assign or reassign a relationship manager to a client' })
  assignRM(
    @Param('clientId') clientId: string,
    @Body() body: { rmId: string },
  ) {
    return this.svc.assignRM(clientId, body.rmId);
  }

  // ── Relationship Managers ────────────────────────────────────────────────

  @Get('relationship-managers')
  @ApiOperation({ summary: 'List all relationship managers with utilization' })
  listRMs() {
    return this.svc.listRMs();
  }

  @Get('relationship-managers/:rmId')
  @ApiOperation({ summary: 'Get a specific relationship manager' })
  getRM(@Param('rmId') rmId: string) {
    return this.svc.getRM(rmId);
  }

  @Post('relationship-managers')
  @ApiOperation({ summary: 'Add a new relationship manager' })
  addRM(
    @Body() body: {
      name: string;
      email: string;
      phone: string;
      specializations: string[];
      maxClientCount: number;
      preferredTiers: WealthTier[];
    },
  ) {
    return this.svc.addRM(body);
  }

  // ── Concierge ────────────────────────────────────────────────────────────

  @Post('concierge')
  @ApiOperation({ summary: 'Create a concierge service request (requires ELITE or ULTRA service level)' })
  createRequest(
    @Body() body: {
      clientId: string;
      type: ConciergeRequestType;
      description: string;
      priority?: 'ROUTINE' | 'URGENT' | 'CRITICAL';
    },
  ) {
    return this.svc.createConciergeRequest(body);
  }

  @Patch('concierge/:requestId')
  @ApiOperation({ summary: 'Update concierge request status / assignment / resolution notes' })
  updateRequest(
    @Param('requestId') requestId: string,
    @Body() body: {
      status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
      assignedTo?: string;
      resolutionNotes?: string;
    },
  ) {
    return this.svc.updateConciergeRequest(requestId, body);
  }

  @Get('concierge')
  @ApiOperation({ summary: 'List concierge requests, optionally filtered by client' })
  @ApiQuery({ name: 'clientId', required: false })
  listRequests(@Query('clientId') clientId?: string) {
    return this.svc.listConciergeRequests(clientId);
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Consolidated private banking summary: AUM by tier, RM utilization' })
  getSummary() {
    return this.svc.getConsolidatedSummary();
  }
}
