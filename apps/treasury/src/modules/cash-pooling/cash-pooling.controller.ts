import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CashPoolingService, PoolAccount, PoolType, SweepFrequency } from './cash-pooling.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Cash Pooling')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cash-pooling')
export class CashPoolingController {
  constructor(private readonly cashPoolingService: CashPoolingService) {}

  @Post('pools')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a physical or notional cash pool structure' })
  createPool(
    @Body() body: {
      poolName: string;
      poolType: PoolType;
      headerAccountId: string;
      currency: string;
      sweepFrequency: SweepFrequency;
      interestRate: number;
      accounts: Omit<PoolAccount, 'currentBalance'>[];
      initialBalances: Record<string, number>;
    },
  ) {
    return this.cashPoolingService.createPool(body);
  }

  @Get('pools')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all cash pools' })
  getAllPools() {
    return this.cashPoolingService.getAllPools();
  }

  @Get('pools/:poolId')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get pool details' })
  getPool(@Param('poolId') poolId: string) {
    return this.cashPoolingService.getPool(poolId);
  }

  @Get('pools/:poolId/snapshot')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Pool snapshot — balances, targets, alerts' })
  getPoolSnapshot(@Param('poolId') poolId: string) {
    return this.cashPoolingService.getPoolSnapshot(poolId);
  }

  @Post('pools/:poolId/sweep')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Execute physical zero-balance sweep for a pool' })
  runPhysicalSweep(@Param('poolId') poolId: string) {
    return this.cashPoolingService.runPhysicalSweep(poolId);
  }

  @Get('pools/:poolId/notional-summary')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Notional pool interest netting summary' })
  getNotionalSummary(@Param('poolId') poolId: string) {
    return this.cashPoolingService.computeNotionalPoolSummary(poolId);
  }

  @Post('pools/:poolId/allocate-interest')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Allocate interest across pool accounts for a period' })
  allocateInterest(
    @Param('poolId') poolId: string,
    @Body() body: { totalInterest: number; period: string },
  ) {
    return this.cashPoolingService.allocateInterest(poolId, body.totalInterest, body.period);
  }

  @Post('pools/:poolId/accounts/:accountId/balance')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update account balance within a pool (admin / batch reconciliation)' })
  updateAccountBalance(
    @Param('poolId') poolId: string,
    @Param('accountId') accountId: string,
    @Body() body: { balance: number },
  ) {
    return this.cashPoolingService.updateAccountBalance(poolId, accountId, body.balance);
  }
}
