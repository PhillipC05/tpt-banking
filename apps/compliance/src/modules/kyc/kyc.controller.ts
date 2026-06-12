import {
  Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycDocumentType } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { HmacWebhookValidator, ApiKeyWebhookValidator } from '@tpt/integrations';

class InitiateKycDto {
  @IsUUID() customerId!: string;
  @IsString() email!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsEnum(KycDocumentType) documentType?: KycDocumentType;
  @IsOptional() @IsString() documentCountry?: string;
}

class ManualReviewDto {
  @IsString() decision!: 'APPROVED' | 'DECLINED';
  @IsOptional() @IsString() notes?: string;
}

const jumioValidator  = new HmacWebhookValidator({ signatureHeader: 'x-jumio-hmac-token' });
const onfidoValidator = new ApiKeyWebhookValidator('x-sha2-signature');

@ApiTags('KYC')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kyc')
export class KycController {
  constructor(
    private readonly kycService: KycService,
    private readonly config: ConfigService,
  ) {}

  @Post('initiate')
  @Roles(Role.TELLER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Initiate KYC verification (Jumio or Onfido — configured by env)' })
  initiate(@Body() dto: InitiateKycDto) {
    return this.kycService.initiateVerification(dto);
  }

  @Get('customer/:customerId')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN, Role.RELATIONSHIP_MANAGER)
  @ApiOperation({ summary: 'Get all KYC verifications for a customer' })
  findByCustomer(@Param('customerId') customerId: string) {
    return this.kycService.findByCustomer(customerId);
  }

  @Get(':id')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get KYC verification by ID' })
  findOne(@Param('id') id: string) {
    return this.kycService.findById(id);
  }

  @Post(':id/review')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Manually approve or decline a KYC verification' })
  manualReview(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ManualReviewDto,
  ) {
    return this.kycService.manualReview(id, user.sub, dto.decision, dto.notes);
  }

  @Post('webhook/jumio')
  @ApiOperation({ summary: 'Jumio webhook callback — validates HMAC-SHA256 signature' })
  jumioWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: Record<string, unknown>,
  ) {
    const secret = this.config.get<string>('JUMIO_WEBHOOK_SECRET', '');
    if (secret) {
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload));
      const valid   = jumioValidator.validate(req.headers as Record<string, string>, rawBody, secret);
      if (!valid) throw new UnauthorizedException('Invalid Jumio webhook signature');
    }
    return this.kycService.processJumioWebhook(payload);
  }

  @Post('webhook/onfido')
  @ApiOperation({ summary: 'Onfido webhook callback — validates X-SHA2-Signature header' })
  onfidoWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: Record<string, unknown>,
    @Headers('x-sha2-signature') signature: string,
  ) {
    const secret = this.config.get<string>('ONFIDO_WEBHOOK_TOKEN', '');
    if (secret) {
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload));
      const valid   = onfidoValidator.validate(req.headers as Record<string, string>, rawBody, secret);
      if (!valid) throw new UnauthorizedException('Invalid Onfido webhook signature');
    }
    return this.kycService.processOnfidoWebhook(payload);
  }
}
