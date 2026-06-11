import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RtpService } from './rtp.service';
import { RtpRail } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import {
  IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, MinLength,
} from 'class-validator';

class SendRtpDto {
  @IsUUID() accountId!: string;
  @IsEnum(RtpRail) rail!: RtpRail;
  @IsNumber() @IsPositive() amount!: number;
  @IsString() creditorName!: string;
  @IsString() creditorAccountNumber!: string;
  @IsString() @Length(9, 9) creditorRoutingNumber!: string;
  @IsOptional() @IsString() creditorBankName?: string;
  @IsOptional() @IsString() remittanceInfo?: string;
  @IsOptional() @IsString() @Length(4, 4) purposeCode?: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
}

@ApiTags('Payments — RTP / FedNow')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments/rtp')
export class RtpController {
  constructor(private readonly rtpService: RtpService) {}

  @Post()
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Send a real-time payment via TCH RTP or FedNow. Sub-second settlement, 24/7/365.',
    description: 'TCH RTP limit: $1,000,000. FedNow limit: $500,000.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  send(@CurrentUser() user: JwtPayload, @Body() dto: SendRtpDto) {
    return this.rtpService.send({ ...dto, customerId: user.sub });
  }

  @Get(':id')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get RTP / FedNow payment by ID' })
  findOne(@Param('id') id: string) {
    return this.rtpService.findByIdOrThrow(id);
  }

  @Get('account/:accountId')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get all RTP / FedNow payments for an account' })
  findByAccount(@Param('accountId') accountId: string) {
    return this.rtpService.findByAccount(accountId);
  }

  @Post(':id/settle')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Manually settle an RTP payment (webhook from network)' })
  settle(@Param('id') id: string) {
    return this.rtpService.settle(id);
  }
}
