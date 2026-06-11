import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AmlService } from './aml.service';
import { AmlAlertSeverity } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import { IsOptional, IsString, IsUUID } from 'class-validator';

class CloseAlertDto {
  @IsString() resolution!: 'NO_ACTION' | 'SAR_FILED' | 'FALSE_POSITIVE';
  @IsString() notes!: string;
  @IsOptional() @IsUUID() caseId?: string;
}

@ApiTags('AML Monitoring')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aml')
export class AmlController {
  constructor(private readonly amlService: AmlService) {}

  @Get('alerts')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get open AML alerts (filterable by severity / overdue)' })
  @ApiQuery({ name: 'severity', enum: AmlAlertSeverity, required: false })
  @ApiQuery({ name: 'overdue', type: Boolean, required: false })
  getOpenAlerts(
    @Query('severity') severity?: AmlAlertSeverity,
    @Query('overdue') overdue?: boolean,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.amlService.findOpen({ severity, overdue });
  }

  @Get('alerts/metrics')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get AML alert metrics dashboard' })
  getMetrics() {
    return this.amlService.getMetrics();
  }

  @Get('alerts/customer/:customerId')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all AML alerts for a customer' })
  findByCustomer(@Param('customerId') customerId: string) {
    return this.amlService.findByCustomer(customerId);
  }

  @Get('alerts/:id')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get AML alert by ID' })
  findOne(@Param('id') id: string) {
    return this.amlService.findByIdOrThrow(id);
  }

  @Post('alerts/:id/assign')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign an alert to a compliance officer' })
  assign(@Param('id') id: string, @Body() body: { assigneeUserId: string }) {
    return this.amlService.assignAlert(id, body.assigneeUserId);
  }

  @Post('alerts/:id/close')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Close an alert with a resolution decision' })
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: CloseAlertDto) {
    return this.amlService.closeAlert(id, user.sub, dto.resolution, dto.notes, dto.caseId);
  }

  @Post('alerts/:id/escalate')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Escalate an alert to a compliance case' })
  escalate(@Param('id') id: string, @Body() body: { caseId: string }) {
    return this.amlService.escalate(id, body.caseId);
  }
}
