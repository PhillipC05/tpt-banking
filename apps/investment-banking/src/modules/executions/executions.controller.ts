import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ExecutionsService } from './executions.service';
import { ExecType, SettlementType } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

class RecordFillDto {
  @IsUUID() orderId!: string;
  @IsOptional() @IsEnum(ExecType) execType?: ExecType;
  @IsNumber() @IsPositive() lastQty!: number;
  @IsNumber() @IsPositive() lastPx!: number;
  @IsOptional() @IsNumber() commission?: number;
  @IsOptional() @IsString() lastMkt?: string;
  @IsOptional() @IsString() counterpartyId?: string;
  @IsOptional() @IsEnum(SettlementType) settlementType?: SettlementType;
}

@ApiTags('EMS — Executions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('executions')
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  @Post('fill')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Record a fill (execution) against an order — FIX Execution Report',
    description:
      'Updates order status (cumQty, leavesQty, avgPx), creates position update, ' +
      'and calculates settlement date based on T+N.',
  })
  recordFill(@Body() dto: RecordFillDto) {
    return this.executionsService.recordFill(dto);
  }

  @Get('pending-settlement')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get executions pending settlement (settlement_date ≤ today)' })
  getPendingSettlement() {
    return this.executionsService.findPendingSettlement();
  }

  @Get('order/:orderId')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all executions for a specific order' })
  findByOrder(@Param('orderId') orderId: string) {
    return this.executionsService.findByOrder(orderId);
  }

  @Get('pnl/:portfolioId')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Get realized trading P&L for a portfolio' })
  @ApiQuery({ name: 'date', type: String, required: false, description: 'YYYY-MM-DD' })
  getTradingPnl(@Param('portfolioId') portfolioId: string, @Query('date') date?: string) {
    return this.executionsService.getTradingPnl(portfolioId, date ? new Date(date) : undefined);
  }

  @Post(':id/settle')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark an execution as settled (DvP confirmed)' })
  settle(@Param('id') id: string, @Body() body: { journalId?: string }) {
    return this.executionsService.settle(id, body.journalId);
  }
}
