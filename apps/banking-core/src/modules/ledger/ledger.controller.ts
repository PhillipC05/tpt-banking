import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JournalService } from './journal.service';
import { PostJournalDto } from './dto/post-journal.dto';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Ledger')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly journalService: JournalService) {}

  @Post('journals')
  @Roles(Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Post a double-entry journal (balanced debit/credit entries)' })
  postJournal(@Body() dto: PostJournalDto) {
    return this.journalService.postJournal(dto);
  }

  @Get('journals/:id')
  @Roles(Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get a journal with all its ledger entries' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  findJournal(@Param('id') id: string) {
    return this.journalService.findJournal(id);
  }

  @Post('journals/:id/reverse')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reverse a posted journal (creates a mirror reversal journal)' })
  reverseJournal(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.journalService.reverseJournal(id, body.reason);
  }

  @Get('accounts/:accountId')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get ledger entries for an account (paginated)' })
  @ApiParam({ name: 'accountId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  getAccountLedger(
    @Param('accountId') accountId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journalService.getAccountLedger(accountId, {
      page,
      limit,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
