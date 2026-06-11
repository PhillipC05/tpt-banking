import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import { BaselService, BaselCapitalInput } from './basel.service';

@ApiTags('Basel III/IV Capital Adequacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('regulatory/basel')
export class BaselController {
  constructor(private readonly baselService: BaselService) {}

  @Post('capital-adequacy')
  @ApiOperation({
    summary: 'Generate Basel III/IV Capital Adequacy Report',
    description:
      'Computes CET1, Tier 1, Total Capital, and Leverage Ratios against Basel III/IV minimums. ' +
      'Supports Basel IV SA-CR risk weights, IRBA, output floor (72.5%), G-SIB surcharges, and TLAC.',
  })
  generateReport(@Body() input: BaselCapitalInput) {
    return this.baselService.generateCapitalAdequacyReport(input);
  }

  @Get('regulatory-rates')
  @ApiOperation({ summary: 'Get Basel III/IV risk weights, haircuts, and minimum ratios' })
  getRegulatoryRates() {
    return this.baselService.getRegulatoryRates();
  }
}
