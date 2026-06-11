import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { KycDocumentType } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

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

@ApiTags('KYC')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

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
  @ApiOperation({ summary: 'Jumio webhook callback (no auth — validate Jumio signature)' })
  jumioWebhook(@Body() payload: Record<string, unknown>) {
    return this.kycService.processJumioWebhook(payload);
  }

  @Post('webhook/onfido')
  @ApiOperation({ summary: 'Onfido webhook callback (no auth — validate Onfido signature)' })
  onfidoWebhook(@Body() payload: Record<string, unknown>) {
    return this.kycService.processOnfidoWebhook(payload);
  }
}
