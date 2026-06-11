import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NostroService, AccountRole, NostroAccount, StatementEntryType } from './nostro.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Nostro / Vostro')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('nostro')
export class NostroController {
  constructor(private readonly nostroService: NostroService) {}

  // ── Account management ────────────────────────────────────────────────────

  @Post('accounts')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Open a new nostro or vostro account' })
  openAccount(
    @Body() body: Omit<NostroAccount, 'accountId' | 'currentBalance' | 'correspondentBalance' | 'lastStatementDate' | 'openedDate'>,
  ) {
    return this.nostroService.openAccount(body);
  }

  @Get('accounts')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all nostro/vostro accounts' })
  @ApiQuery({ name: 'role', required: false, enum: ['NOSTRO', 'VOSTRO'] })
  getAllAccounts(@Query('role') role?: AccountRole) {
    return this.nostroService.getAllAccounts(role);
  }

  @Get('accounts/:accountId')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get nostro/vostro account details' })
  getAccount(@Param('accountId') accountId: string) {
    return this.nostroService.getAccount(accountId);
  }

  @Post('accounts/:accountId/balance')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Post a balance movement to a nostro/vostro account' })
  updateBalance(
    @Param('accountId') accountId: string,
    @Body() body: { amount: number; type: StatementEntryType },
  ) {
    return this.nostroService.updateBalance(accountId, body.amount, body.type);
  }

  // ── Statement processing ──────────────────────────────────────────────────

  @Post('accounts/:accountId/statement')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Import SWIFT MT940/MT950 statement entries and auto-reconcile' })
  processStatement(
    @Param('accountId') accountId: string,
    @Body() body: {
      correspondentClosingBalance: number;
      entries: Array<{
        valueDate: string;
        bookingDate: string;
        entryType: StatementEntryType;
        amount: number;
        counterpartyReference: string;
        ourReference: string;
        description: string;
        swiftMT?: string;
      }>;
    },
  ) {
    return this.nostroService.processStatementEntries(accountId, body.entries, body.correspondentClosingBalance);
  }

  @Post('accounts/:accountId/match')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Manually match two statement entries' })
  manualMatch(
    @Param('accountId') accountId: string,
    @Body() body: { entryId1: string; entryId2: string },
  ) {
    this.nostroService.manualMatch(body.entryId1, body.entryId2, accountId);
    return { matched: true };
  }

  @Post('accounts/:accountId/entries/:entryId/dispute')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark a statement entry as disputed' })
  disputeEntry(
    @Param('accountId') accountId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.nostroService.disputeEntry(entryId, accountId);
  }

  // ── Reconciliation ────────────────────────────────────────────────────────

  @Get('accounts/:accountId/reconcile')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Run nostro reconciliation — break analysis, timing vs. amount differences' })
  reconcile(@Param('accountId') accountId: string) {
    return this.nostroService.reconcile(accountId);
  }

  // ── Balance ladder ────────────────────────────────────────────────────────

  @Get('balance-ladder')
  @Roles(Role.TRADER, Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Nostro balance ladder — all accounts with our vs. correspondent balances' })
  @ApiQuery({ name: 'currency', required: false, example: 'USD' })
  getBalanceLadder(@Query('currency') currency?: string) {
    return this.nostroService.getBalanceLadder(currency);
  }
}
