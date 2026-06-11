import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SepaService } from './sepa.service';
import { SepaScheme } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import {
  IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, MinLength,
} from 'class-validator';

class SendSepaDto {
  @IsUUID() accountId!: string;
  @IsEnum(SepaScheme) scheme!: SepaScheme;
  @IsNumber() @IsPositive() amount!: number;
  @IsString() debtorName!: string;
  @IsString() debtorIban!: string;
  @IsOptional() @IsString() debtorBic?: string;
  @IsString() creditorName!: string;
  @IsString() creditorIban!: string;
  @IsOptional() @IsString() creditorBic?: string;
  @IsOptional() @IsString() creditorBankName?: string;
  @IsOptional() @IsString() creditorAddress?: string;
  @IsOptional() @IsString() @Length(2, 2) creditorCountry?: string;
  @IsOptional() @IsString() remittanceInfo?: string;
  @IsOptional() @IsString() @Length(4, 4) purposeCode?: string;
  @IsOptional() @IsDateString() executionDate?: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
}

@ApiTags('Payments — SEPA')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments/sepa')
export class SepaController {
  constructor(private readonly sepaService: SepaService) {}

  @Post()
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Send a SEPA payment (SCT standard, SCT Inst real-time, or SDD direct debit)',
    description: 'SCT Inst: max €100,000, 10-second settlement. SCT: next business day.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  send(@CurrentUser() user: JwtPayload, @Body() dto: SendSepaDto) {
    return this.sepaService.send({
      ...dto,
      customerId: user.sub,
      executionDate: dto.executionDate ? new Date(dto.executionDate) : undefined,
    });
  }

  @Get(':id')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get SEPA payment by ID' })
  findOne(@Param('id') id: string) {
    return this.sepaService.findByIdOrThrow(id);
  }

  @Get('account/:accountId')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get all SEPA payments for an account' })
  findByAccount(@Param('accountId') accountId: string) {
    return this.sepaService.findByAccount(accountId);
  }

  @Post(':id/settle')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Manually settle a pending SCT payment (next-day settlement webhook)' })
  settle(@Param('id') id: string) {
    return this.sepaService.settle(id);
  }
}
