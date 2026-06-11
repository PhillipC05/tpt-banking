import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { ApplyForLoanDto } from './dto/apply-for-loan.dto';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';

@ApiTags('Loans')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post('apply')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Submit a loan application' })
  applyForLoan(@CurrentUser() user: JwtPayload, @Body() dto: ApplyForLoanDto) {
    // In production: look up the customerId from the authenticated user
    return this.loansService.applyForLoan(user.sub, dto);
  }

  @Get()
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get all loans for the authenticated customer' })
  getMyLoans(@CurrentUser() user: JwtPayload) {
    return this.loansService.findByCustomer(user.sub);
  }

  @Get(':id')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get loan details by ID' })
  findOne(@Param('id') id: string) {
    return this.loansService.findByIdOrThrow(id);
  }

  @Get(':id/schedule')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get amortization / payment schedule for a loan' })
  getSchedule(@Param('id') id: string) {
    return this.loansService.getPaymentSchedule(id);
  }

  @Post(':id/underwrite')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Underwrite a loan application (approve or decline)' })
  underwrite(
    @Param('id') id: string,
    @Body() body: { creditScore: number; notes?: string },
  ) {
    return this.loansService.underwriteLoan(id, body.creditScore, body.notes);
  }

  @Post(':id/disburse')
  @Roles(Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Disburse an approved loan to a customer account' })
  disburse(@Param('id') id: string, @Body() body: { accountId: string }) {
    return this.loansService.disburseLoan(id, body.accountId);
  }

  @Post(':id/payment')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Make a loan payment' })
  makePayment(@Param('id') id: string, @Body() body: { amount: number }) {
    return this.loansService.processPayment(id, body.amount);
  }
}
