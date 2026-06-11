import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import { AccountStatus } from '@tpt/database';

@ApiTags('Accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Roles(Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Open a new bank account for a customer' })
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Get(':id')
  @Roles(Role.TELLER, Role.RELATIONSHIP_MANAGER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get account details by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  findOne(@Param('id') id: string) {
    return this.accountsService.findByIdOrThrow(id);
  }

  @Get(':id/balance')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get account balance (booked, available, holds)' })
  getBalance(@Param('id') id: string) {
    return this.accountsService.getBalance(id);
  }

  @Get('customer/:customerId')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.RELATIONSHIP_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all accounts for a customer' })
  findByCustomer(@Param('customerId') customerId: string) {
    return this.accountsService.findByCustomer(customerId);
  }

  @Patch(':id/status')
  @Roles(Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update account status (freeze, close, reactivate)' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: AccountStatus; reason?: string },
  ) {
    return this.accountsService.updateStatus(id, body.status, body.reason);
  }
}
