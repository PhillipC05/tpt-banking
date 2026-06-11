import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import { FinraService, NetCapitalInput, FocusReportInput, TradeReportSummary } from './finra.service';

@ApiTags('FINRA Reporting')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('regulatory/finra')
export class FinraController {
  constructor(private readonly finraService: FinraService) {}

  @Post('net-capital')
  @ApiOperation({
    summary: 'Compute Net Capital (SEC Rule 15c3-1)',
    description:
      'Applies SEC Rule 15c3-1 haircuts to compute allowable net capital. ' +
      'Supports both Standard (15:1 aggregate indebtedness) and Alternative (2% of debit items) methods. ' +
      'Flags early warning thresholds (120% of minimum) and deficiencies.',
  })
  computeNetCapital(@Body() input: NetCapitalInput) {
    return this.finraService.computeNetCapital(input);
  }

  @Post('focus-report')
  @ApiOperation({
    summary: 'Generate FOCUS Report (Form X-17A-5)',
    description:
      'Produces a FINRA FOCUS Report (Form X-17A-5 Part II) including balance sheet, ' +
      'income statement, net capital summary, and SIPC assessment computation.',
  })
  generateFocusReport(@Body() input: FocusReportInput) {
    return this.finraService.generateFocusReport(input);
  }

  @Post('trace-report')
  @ApiOperation({
    summary: 'Generate TRACE trade reporting compliance summary',
    description:
      'Summarizes TRACE (Trade Reporting and Compliance Engine) compliance: ' +
      'corporate and agency bond trade counts, timeliness, late reports, and cancellation rates.',
  })
  generateTraceReport(@Body() summary: TradeReportSummary) {
    return this.finraService.generateTraceReport(summary);
  }

  @Get('regulatory-reference')
  @ApiOperation({ summary: 'Get FINRA regulatory rule references and haircut schedule' })
  getRegulatoryReference() {
    return this.finraService.getRegulatoryReference();
  }
}
