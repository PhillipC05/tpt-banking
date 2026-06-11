import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import { CcarDfastService, CcarDfastInput } from './ccar-dfast.service';

@ApiTags('CCAR / DFAST Stress Test Reporting')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('regulatory/ccar-dfast')
export class CcarDfastController {
  constructor(private readonly service: CcarDfastService) {}

  @Post('report')
  @ApiOperation({
    summary: 'Generate CCAR / DFAST stress test report for a single scenario',
    description:
      'Produces a 9-quarter forward projection of PPNR, loan losses, provisions, net income, ' +
      'and capital ratios under the specified Fed CCAR scenario (Severely Adverse / Adverse / Baseline). ' +
      'Evaluates compliance with Fed minimum capital requirements throughout the projection horizon.',
  })
  generateReport(@Body() input: CcarDfastInput) {
    return this.service.generateReport(input);
  }

  @Post('all-scenarios')
  @ApiOperation({
    summary: 'Run all three CCAR scenarios in a single call',
    description:
      'Runs Severely Adverse, Adverse, and Baseline CCAR scenarios simultaneously and returns ' +
      'all three reports plus a cross-scenario summary identifying the worst-case minimum CET1 ratio.',
  })
  runAllScenarios(@Body() input: Omit<CcarDfastInput, 'scenario'>) {
    return this.service.runAllScenarios(input);
  }

  @Get('scenario-definitions')
  @ApiOperation({ summary: 'Get CCAR 2024 scenario definitions and economic assumptions' })
  getScenarioDefinitions() {
    return this.service.getScenarioDefinitions();
  }
}
