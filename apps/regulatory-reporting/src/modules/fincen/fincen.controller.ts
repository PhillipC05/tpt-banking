import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import {
  FincenService,
  SarRecord,
  CtrRecord,
  FbarInput,
  BsaAggregateInput,
  BoiReportInput,
} from './fincen.service';

class SarBatchDto {
  sars!: SarRecord[];
  periodStart!: string;
  periodEnd!: string;
}

class CtrBatchDto {
  ctrs!: CtrRecord[];
  periodStart!: string;
  periodEnd!: string;
}

@ApiTags('FinCEN Reporting')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('regulatory/fincen')
export class FincenController {
  constructor(private readonly fincenService: FincenService) {}

  @Post('sar-export')
  @ApiOperation({
    summary: 'Export SAR batch for FinCEN filing',
    description:
      'Aggregates Suspicious Activity Reports for a period: counts by type, total amounts, ' +
      'overdue detection (>30 days from suspicious activity), and FinCEN BSA ID tracking.',
  })
  exportSarBatch(@Body() dto: SarBatchDto) {
    return this.fincenService.exportSarBatch(dto.sars, dto.periodStart, dto.periodEnd);
  }

  @Post('ctr-export')
  @ApiOperation({
    summary: 'Export CTR batch for FinCEN filing',
    description:
      'Aggregates Currency Transaction Reports (≥$10K cash) for a period: filing status, ' +
      'overdue detection (>15 days), cash-in/cash-out totals.',
  })
  exportCtrBatch(@Body() dto: CtrBatchDto) {
    return this.fincenService.exportCtrBatch(dto.ctrs, dto.periodStart, dto.periodEnd);
  }

  @Post('fbar')
  @ApiOperation({
    summary: 'Generate FBAR report (FinCEN Form 114)',
    description:
      'Produces a Foreign Bank Account Report for foreign financial accounts exceeding $10,000 aggregate. ' +
      'Computes filing deadlines and flags FATCA co-reporting requirements for large balances.',
  })
  generateFbarReport(@Body() input: FbarInput) {
    return this.fincenService.generateFbarReport(input);
  }

  @Post('bsa-aggregate')
  @ApiOperation({
    summary: 'Generate BSA aggregate compliance report',
    description:
      'BSA program-level summary of SAR and CTR activity: filing rates, pending counts, ' +
      'cash activity totals, and composite BSA compliance score (0–100).',
  })
  generateBsaReport(@Body() input: BsaAggregateInput) {
    return this.fincenService.generateBsaAggregateReport(input);
  }

  @Post('boi-report')
  @ApiOperation({
    summary: 'Generate Beneficial Ownership Information (BOI) report',
    description:
      'Corporate Transparency Act BOI filing: beneficial owner collection, ' +
      'exemption validation, filing deadlines, and document verification status.',
  })
  generateBoiReport(@Body() input: BoiReportInput) {
    return this.fincenService.generateBoiReport(input);
  }

  @Get('regulatory-reference')
  @ApiOperation({ summary: 'Get FinCEN regulatory rule references, thresholds, and deadlines' })
  getRegulatoryReference() {
    return this.fincenService.getRegulatoryReference();
  }
}
