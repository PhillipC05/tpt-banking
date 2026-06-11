import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TradeLifecycleService } from './trade-lifecycle.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Trade Lifecycle')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trade-lifecycle')
export class TradeLifecycleController {
  constructor(private readonly service: TradeLifecycleService) {}

  @Get('order/:orderId')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get full trade lifecycle for an order',
    description: 'Returns order, all executions, current stage, and timeline from entry to settlement.',
  })
  getOrderLifecycle(@Param('orderId') orderId: string) {
    return this.service.getOrderLifecycle(orderId);
  }

  @Get('failed-settlements')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all failed / overdue settlements (settlement_date < today)' })
  getFailedSettlements() {
    return this.service.getFailedSettlements();
  }

  @Get('settlement-ladder')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Settlement ladder — pending settlements for next N days' })
  @ApiQuery({ name: 'days', type: Number, required: false, description: 'Look-ahead days (default 5)' })
  getSettlementLadder(@Query('days') days?: number) {
    return this.service.getSettlementLadder(days ? +days : 5);
  }
}
