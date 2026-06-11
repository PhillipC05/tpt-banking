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
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('transfers')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Initiate an internal funds transfer (idempotent)',
    description: 'Transfers funds between two accounts via the double-entry ledger. Requires Idempotency-Key header.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique key to prevent duplicate transfers' })
  initiateTransfer(@Body() dto: InitiateTransferDto) {
    return this.transactionsService.initiateTransfer(dto);
  }

  @Get('transactions/:id')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get transaction details by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  findOne(@Param('id') id: string) {
    return this.transactionsService.findById(id);
  }

  @Get('accounts/:accountId/transactions')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get transaction history for an account (paginated)' })
  @ApiParam({ name: 'accountId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findByAccount(
    @Param('accountId') accountId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.transactionsService.findByAccountId(accountId, { page, limit });
  }
}
