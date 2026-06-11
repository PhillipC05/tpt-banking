import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';
import { AchService } from './ach.service';
import { AchDirection } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';

class InitiateAchBodyDto {
  @IsUUID() accountId!: string;
  @IsEnum(AchDirection) direction!: AchDirection;
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() plaidAccessToken?: string;
  @IsOptional() @IsString() routingNumber?: string;
  @IsOptional() @IsString() externalAccountNumber?: string;
  @IsOptional() @IsString() externalAccountHolderName?: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
}

@ApiTags('Payments — ACH')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments/ach')
export class AchController {
  constructor(private readonly achService: AchService) {}

  @Post('link-token')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get a Plaid Link token to initiate bank account linking' })
  createLinkToken(@CurrentUser() user: JwtPayload) {
    return this.achService.createLinkToken(user.sub);
  }

  @Post('link-token/exchange')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT)
  @ApiOperation({ summary: 'Exchange Plaid public token for a stored access token reference' })
  exchangeToken(@Body() body: { publicToken: string }) {
    return this.achService.exchangePlaidToken(body.publicToken);
  }

  @Post()
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Initiate an ACH transfer (credit or debit)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  initiate(@CurrentUser() user: JwtPayload, @Body() dto: InitiateAchBodyDto) {
    return this.achService.initiate({ ...dto, customerId: user.sub });
  }

  @Get(':id')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get ACH payment by ID' })
  findOne(@Param('id') id: string) {
    return this.achService.findByIdOrThrow(id);
  }

  @Get('account/:accountId')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get all ACH payments for an account' })
  findByAccount(@Param('accountId') accountId: string) {
    return this.achService.findByAccount(accountId);
  }

  @Post(':id/complete')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark ACH payment as completed and post to ledger (webhook endpoint)' })
  complete(@Param('id') id: string) {
    return this.achService.complete(id);
  }
}
