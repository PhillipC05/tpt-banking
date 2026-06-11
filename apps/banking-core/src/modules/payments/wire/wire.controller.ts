import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WireService } from './wire.service';
import { WireType } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import {
  IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, MinLength
} from 'class-validator';

class InitiateWireBodyDto {
  @IsUUID() accountId!: string;
  @IsEnum(WireType) type!: WireType;
  @IsNumber() @IsPositive() amount!: number;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() beneficiaryName!: string;
  @IsString() beneficiaryAccountNumber!: string;
  @IsOptional() @IsString() beneficiaryRoutingNumber?: string;
  @IsOptional() @IsString() beneficiarySwiftBic?: string;
  @IsOptional() @IsString() beneficiaryBankName?: string;
  @IsOptional() @IsString() beneficiaryBankAddress?: string;
  @IsOptional() @IsString() beneficiaryAddress?: string;
  @IsOptional() @IsString() beneficiaryCountry?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() intermediarySwiftBic?: string;
  @IsOptional() @IsString() paymentPurpose?: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
}

@ApiTags('Payments — Wire')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments/wire')
export class WireController {
  constructor(private readonly wireService: WireService) {}

  @Post()
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Initiate a wire transfer (requires step-up token)' })
  @ApiHeader({ name: 'X-Step-Up-Token', required: true, description: 'Step-up authentication token' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  initiate(
    @CurrentUser() user: JwtPayload,
    @Headers('x-step-up-token') stepUpToken: string,
    @Body() dto: InitiateWireBodyDto,
  ) {
    return this.wireService.initiate({
      ...dto,
      customerId: user.sub,
      userId: user.sub,
      stepUpToken,
    });
  }

  @Get(':id')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get wire transfer by ID' })
  findOne(@Param('id') id: string) {
    return this.wireService.findByIdOrThrow(id);
  }

  @Get('account/:accountId')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get all wire transfers for an account' })
  findByAccount(@Param('accountId') accountId: string) {
    return this.wireService.findByAccount(accountId);
  }

  @Post(':id/approve')
  @Roles(Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve a pending wire transfer' })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.wireService.approve(id, user.sub);
  }

  @Post(':id/submit')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Submit an approved wire to the payment network' })
  submit(@Param('id') id: string) {
    return this.wireService.submit(id);
  }

  @Post(':id/complete')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark a wire as completed (webhook from correspondent bank)' })
  complete(@Param('id') id: string) {
    return this.wireService.complete(id);
  }
}
