import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import { SecService, Form13FInput, FormAdvInput, Rule606Input, NPortInput } from './sec.service';

@ApiTags('SEC Reporting')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('regulatory/sec')
export class SecController {
  constructor(private readonly secService: SecService) {}

  @Post('form-13f')
  @ApiOperation({
    summary: 'Generate Form 13F (Institutional Investment Manager Holdings)',
    description:
      'Produces an SEC Form 13F report for institutional investment managers with ≥$100M in 13(f) securities. ' +
      'Aggregates holdings by CUSIP, computes total market value, and calculates the 45-day filing deadline.',
  })
  generateForm13F(@Body() input: Form13FInput) {
    return this.secService.generateForm13F(input);
  }

  @Post('form-adv')
  @ApiOperation({
    summary: 'Generate Form ADV report (Investment Adviser Registration)',
    description:
      'Summarises Form ADV Part 1A/2A data: AUM, client types, fee schedules, disclosure events, ' +
      'and SEC vs. state registration threshold check ($110M AUM).',
  })
  generateFormAdv(@Body() input: FormAdvInput) {
    return this.secService.generateFormAdv(input);
  }

  @Post('rule-606')
  @ApiOperation({
    summary: 'Generate Rule 606 order routing report',
    description:
      'Quarterly order routing disclosure showing venue breakdown, payment for order flow, ' +
      'order concentration, and best execution documentation requirements.',
  })
  generateRule606Report(@Body() input: Rule606Input) {
    return this.secService.generateRule606Report(input);
  }

  @Post('form-n-port')
  @ApiOperation({
    summary: 'Generate Form N-PORT (monthly fund portfolio report)',
    description:
      'Monthly portfolio reporting for registered investment companies: ' +
      'net assets, leverage, asset type breakdown, and top 20 holdings.',
  })
  generateNPort(@Body() input: NPortInput) {
    return this.secService.generateNPort(input);
  }

  @Get('filing-calendar')
  @ApiOperation({ summary: 'Get SEC filing deadlines for the current year' })
  @ApiQuery({ name: 'referenceDate', required: false, description: 'ISO date to compute calendar from (default: today)' })
  getFilingCalendar(@Query('referenceDate') referenceDate?: string) {
    return this.secService.getFilingCalendar(referenceDate);
  }

  @Get('regulatory-reference')
  @ApiOperation({ summary: 'Get SEC rule references and filing requirements' })
  getRegulatoryReference() {
    return this.secService.getRegulatoryReference();
  }
}
