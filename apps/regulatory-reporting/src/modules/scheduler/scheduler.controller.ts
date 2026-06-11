import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import { ReportSchedulerService, ManualTriggerInput, ReportType } from './scheduler.service';

@ApiTags('Regulatory Report Scheduler')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('regulatory/scheduler')
export class ReportSchedulerController {
  constructor(private readonly schedulerService: ReportSchedulerService) {}

  @Get('schedule')
  @ApiOperation({
    summary: 'Get full report schedule with next run times',
    description:
      'Returns all configured regulatory report schedules with cron expressions, ' +
      'frequencies, regulatory authority, next run time, and last run time.',
  })
  getSchedule() {
    return this.schedulerService.getSchedule();
  }

  @Get('compliance-calendar')
  @ApiOperation({
    summary: 'Get compliance filing calendar sorted by next deadline',
    description:
      'Returns all enabled regulatory reports sorted chronologically by next filing deadline. ' +
      'Use to identify upcoming regulatory obligations.',
  })
  @ApiQuery({ name: 'year', required: false, description: 'Calendar year (default: current)' })
  getComplianceCalendar(@Query('year') year?: string) {
    return this.schedulerService.getComplianceCalendar(year ? parseInt(year, 10) : undefined);
  }

  @Get('overdue')
  @ApiOperation({
    summary: 'Get list of overdue regulatory reports',
    description:
      'Returns reports that have not been run within their expected frequency window. ' +
      'Overdue reports require immediate attention to avoid regulatory violations.',
  })
  getOverdueReports() {
    return this.schedulerService.getOverdueReports();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get report run history' })
  @ApiQuery({ name: 'reportType', required: false, description: 'Filter by report type' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (default: 50)' })
  getRunHistory(
    @Query('reportType') reportType?: ReportType,
    @Query('limit') limit?: string,
  ) {
    return this.schedulerService.getRunHistory(reportType, limit ? parseInt(limit, 10) : 50);
  }

  @Post('trigger')
  @ApiOperation({
    summary: 'Manually trigger a regulatory report run',
    description:
      'Immediately triggers the specified report outside the normal schedule. ' +
      'All manual runs are logged with the triggering user ID for audit trail.',
  })
  manualTrigger(@Body() input: ManualTriggerInput) {
    return this.schedulerService.manualTrigger(input);
  }

  @Post(':reportType/enable')
  @ApiOperation({ summary: 'Enable a scheduled report' })
  @ApiParam({ name: 'reportType', description: 'Report type to enable' })
  enableReport(@Param('reportType') reportType: ReportType) {
    return this.schedulerService.enableReport(reportType, true);
  }

  @Post(':reportType/disable')
  @ApiOperation({ summary: 'Disable a scheduled report (will not run until re-enabled)' })
  @ApiParam({ name: 'reportType', description: 'Report type to disable' })
  disableReport(@Param('reportType') reportType: ReportType) {
    return this.schedulerService.enableReport(reportType, false);
  }
}
