import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, Role } from '@tpt/auth';
import { CurrentUser } from '@tpt/common';
import { CddService } from './cdd.service';
import { InitiateCddDto } from './dto/initiate-cdd.dto';

@ApiTags('CDD — Customer Due Diligence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cdd')
export class CddController {
  constructor(private readonly cddService: CddService) {}

  @Post()
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Initiate a CDD assessment for a customer' })
  initiate(@Body() dto: InitiateCddDto) {
    return this.cddService.initiateAssessment(dto);
  }

  @Get(':id')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Get a CDD assessment by ID' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cddService.findByIdOrThrow(id);
  }

  @Get('customer/:customerId')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List CDD assessments for a customer' })
  byCustomer(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.cddService.findByCustomer(customerId);
  }

  @Get('queue/edd-required')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List assessments that require Enhanced Due Diligence' })
  requireingEdd() {
    return this.cddService.findRequiringEdd();
  }

  @Patch(':id/complete')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Complete a CDD assessment and compute risk rating' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
    @Body() overrides?: InitiateCddDto,
  ) {
    return this.cddService.completeAssessment(id, user.sub, overrides);
  }

  @Get(':id/risk-preview')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Preview risk score for a pending assessment without committing' })
  async riskPreview(@Param('id', ParseUUIDPipe) id: string) {
    const assessment = await this.cddService.findByIdOrThrow(id);
    const { score, rating, factors } = this.cddService.calculateRiskScore(assessment);
    return { score, rating, factors };
  }
}
