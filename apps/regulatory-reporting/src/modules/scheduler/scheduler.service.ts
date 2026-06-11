import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';

// ── Report schedule definition ────────────────────────────────────────────────

export type ReportType =
  | 'BASEL_CAPITAL_ADEQUACY'
  | 'CCAR_SEVERELY_ADVERSE'
  | 'CCAR_ADVERSE'
  | 'CCAR_BASELINE'
  | 'DFAST_ANNUAL'
  | 'FINRA_NET_CAPITAL'
  | 'FINRA_FOCUS_REPORT'
  | 'FINRA_TRACE_SUMMARY'
  | 'SEC_FORM_13F'
  | 'SEC_FORM_ADV'
  | 'SEC_RULE_606'
  | 'SEC_FORM_N_PORT'
  | 'FINCEN_SAR_EXPORT'
  | 'FINCEN_CTR_EXPORT'
  | 'FINCEN_BSA_AGGREGATE'
  | 'FINCEN_FBAR'
  | 'FINCEN_BOI_ANNUAL_REVIEW'
  | 'LCR_DAILY_CHECK'
  | 'NSFR_WEEKLY_CHECK';

export type ReportFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUAL'
  | 'ANNUAL'
  | 'ON_DEMAND';

export type RunStatus = 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface ScheduledReport {
  reportType: ReportType;
  frequency: ReportFrequency;
  cronExpression: string;
  description: string;
  regulatoryAuthority: 'BCBS' | 'FED' | 'FINRA' | 'SEC' | 'FINCEN' | 'INTERNAL';
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt: string;
  contactEmail?: string;
  deadlineDaysAfterPeriod: number;
}

export interface ReportRun {
  runId: string;
  reportType: ReportType;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  status: RunStatus;
  triggeredBy: 'SCHEDULER' | 'MANUAL';
  triggeredByUserId?: string;
  durationMs?: number;
  reportReference?: string;   // ID of the generated report
  errorMessage?: string;
  periodCovered?: { start: string; end: string };
}

export interface ManualTriggerInput {
  reportType: ReportType;
  triggeredByUserId: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
}

// ── Static schedule registry ──────────────────────────────────────────────────

const REPORT_SCHEDULES: Record<ReportType, Omit<ScheduledReport, 'nextRunAt'>> = {
  // Internal / Basel III
  LCR_DAILY_CHECK: {
    reportType: 'LCR_DAILY_CHECK',
    frequency: 'DAILY',
    cronExpression: '0 6 * * *',        // 6 AM daily
    description: 'Daily LCR (Liquidity Coverage Ratio) monitoring check',
    regulatoryAuthority: 'BCBS',
    enabled: true,
    deadlineDaysAfterPeriod: 0,
  },
  NSFR_WEEKLY_CHECK: {
    reportType: 'NSFR_WEEKLY_CHECK',
    frequency: 'WEEKLY',
    cronExpression: '0 7 * * 1',        // Monday 7 AM
    description: 'Weekly NSFR (Net Stable Funding Ratio) monitoring check',
    regulatoryAuthority: 'BCBS',
    enabled: true,
    deadlineDaysAfterPeriod: 0,
  },
  BASEL_CAPITAL_ADEQUACY: {
    reportType: 'BASEL_CAPITAL_ADEQUACY',
    frequency: 'QUARTERLY',
    cronExpression: '0 8 1 1,4,7,10 *', // 1st of Jan/Apr/Jul/Oct at 8 AM
    description: 'Quarterly Basel III/IV Capital Adequacy Report (CET1, Tier 1, Total Capital, Leverage)',
    regulatoryAuthority: 'BCBS',
    enabled: true,
    deadlineDaysAfterPeriod: 45,
  },

  // CCAR / DFAST
  CCAR_SEVERELY_ADVERSE: {
    reportType: 'CCAR_SEVERELY_ADVERSE',
    frequency: 'ANNUAL',
    cronExpression: '0 9 1 2 *',        // February 1 — aligns with Fed CCAR cycle
    description: 'Annual CCAR Severely Adverse scenario (Fed stress test submission)',
    regulatoryAuthority: 'FED',
    enabled: true,
    deadlineDaysAfterPeriod: 90,
  },
  CCAR_ADVERSE: {
    reportType: 'CCAR_ADVERSE',
    frequency: 'ANNUAL',
    cronExpression: '0 9 1 2 *',
    description: 'Annual CCAR Adverse scenario',
    regulatoryAuthority: 'FED',
    enabled: true,
    deadlineDaysAfterPeriod: 90,
  },
  CCAR_BASELINE: {
    reportType: 'CCAR_BASELINE',
    frequency: 'ANNUAL',
    cronExpression: '0 9 1 2 *',
    description: 'Annual CCAR Baseline scenario',
    regulatoryAuthority: 'FED',
    enabled: true,
    deadlineDaysAfterPeriod: 90,
  },
  DFAST_ANNUAL: {
    reportType: 'DFAST_ANNUAL',
    frequency: 'ANNUAL',
    cronExpression: '0 9 15 3 *',       // March 15 — typical DFAST public disclosure deadline
    description: 'Annual Dodd-Frank Act Stress Test (DFAST) — all three scenarios, public disclosure',
    regulatoryAuthority: 'FED',
    enabled: true,
    deadlineDaysAfterPeriod: 60,
  },

  // FINRA
  FINRA_NET_CAPITAL: {
    reportType: 'FINRA_NET_CAPITAL',
    frequency: 'MONTHLY',
    cronExpression: '0 7 1 * *',        // 1st of each month
    description: 'Monthly FINRA Net Capital computation (Rule 15c3-1)',
    regulatoryAuthority: 'FINRA',
    enabled: true,
    deadlineDaysAfterPeriod: 17,
  },
  FINRA_FOCUS_REPORT: {
    reportType: 'FINRA_FOCUS_REPORT',
    frequency: 'QUARTERLY',
    cronExpression: '0 8 15 1,4,7,10 *',
    description: 'Quarterly FINRA FOCUS Report (Form X-17A-5) — balance sheet, income, net capital, SIPC',
    regulatoryAuthority: 'FINRA',
    enabled: true,
    deadlineDaysAfterPeriod: 17,
  },
  FINRA_TRACE_SUMMARY: {
    reportType: 'FINRA_TRACE_SUMMARY',
    frequency: 'MONTHLY',
    cronExpression: '0 7 2 * *',        // 2nd of each month
    description: 'Monthly TRACE trade reporting compliance summary',
    regulatoryAuthority: 'FINRA',
    enabled: true,
    deadlineDaysAfterPeriod: 5,
  },

  // SEC
  SEC_FORM_13F: {
    reportType: 'SEC_FORM_13F',
    frequency: 'QUARTERLY',
    cronExpression: '0 9 1 2,5,8,11 *', // first of Feb/May/Aug/Nov (45 days after Q end)
    description: 'Quarterly SEC Form 13F — institutional investment manager holdings',
    regulatoryAuthority: 'SEC',
    enabled: true,
    deadlineDaysAfterPeriod: 45,
  },
  SEC_FORM_ADV: {
    reportType: 'SEC_FORM_ADV',
    frequency: 'ANNUAL',
    cronExpression: '0 9 1 4 *',        // April 1 — within 90 days of fiscal year end (Dec 31)
    description: 'Annual Form ADV amendment (Investment Adviser Registration)',
    regulatoryAuthority: 'SEC',
    enabled: true,
    deadlineDaysAfterPeriod: 90,
  },
  SEC_RULE_606: {
    reportType: 'SEC_RULE_606',
    frequency: 'QUARTERLY',
    cronExpression: '0 9 15 2,5,8,11 *',
    description: 'Quarterly SEC Rule 606 order routing report (public disclosure)',
    regulatoryAuthority: 'SEC',
    enabled: true,
    deadlineDaysAfterPeriod: 45,
  },
  SEC_FORM_N_PORT: {
    reportType: 'SEC_FORM_N_PORT',
    frequency: 'MONTHLY',
    cronExpression: '0 9 1 * *',
    description: 'Monthly SEC Form N-PORT — registered fund portfolio reporting',
    regulatoryAuthority: 'SEC',
    enabled: false, // only applicable to registered investment companies
    deadlineDaysAfterPeriod: 30,
  },

  // FinCEN
  FINCEN_SAR_EXPORT: {
    reportType: 'FINCEN_SAR_EXPORT',
    frequency: 'MONTHLY',
    cronExpression: '0 6 3 * *',        // 3rd of each month
    description: 'Monthly SAR batch export — identify overdue and upcoming filing deadlines',
    regulatoryAuthority: 'FINCEN',
    enabled: true,
    deadlineDaysAfterPeriod: 3,
  },
  FINCEN_CTR_EXPORT: {
    reportType: 'FINCEN_CTR_EXPORT',
    frequency: 'WEEKLY',
    cronExpression: '0 6 * * 2',        // Tuesday 6 AM (weekly CTR review)
    description: 'Weekly CTR batch export — verify 15-day filing compliance',
    regulatoryAuthority: 'FINCEN',
    enabled: true,
    deadlineDaysAfterPeriod: 2,
  },
  FINCEN_BSA_AGGREGATE: {
    reportType: 'FINCEN_BSA_AGGREGATE',
    frequency: 'QUARTERLY',
    cronExpression: '0 8 5 1,4,7,10 *',
    description: 'Quarterly BSA program aggregate report — SAR/CTR compliance scores',
    regulatoryAuthority: 'FINCEN',
    enabled: true,
    deadlineDaysAfterPeriod: 30,
  },
  FINCEN_FBAR: {
    reportType: 'FINCEN_FBAR',
    frequency: 'ANNUAL',
    cronExpression: '0 9 1 3 *',        // March 1 reminder — deadline is April 15
    description: 'Annual FBAR (FinCEN Form 114) — foreign bank account report for qualifying accounts',
    regulatoryAuthority: 'FINCEN',
    enabled: true,
    deadlineDaysAfterPeriod: 45,
  },
  FINCEN_BOI_ANNUAL_REVIEW: {
    reportType: 'FINCEN_BOI_ANNUAL_REVIEW',
    frequency: 'ANNUAL',
    cronExpression: '0 9 1 1 *',        // January 1 annual review reminder
    description: 'Annual Beneficial Ownership Information (BOI) review — update for any changes in ownership/control',
    regulatoryAuthority: 'FINCEN',
    enabled: true,
    deadlineDaysAfterPeriod: 30,
  },
};

@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  // In-memory run history (production: persist to DB)
  private runHistory: ReportRun[] = [];

  constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

  // ── Scheduled tasks ───────────────────────────────────────────────────────

  @Cron('0 6 * * *', { name: 'lcr-daily' })
  async runLcrDailyCheck(): Promise<void> {
    await this.executeScheduledRun('LCR_DAILY_CHECK');
  }

  @Cron('0 7 * * 1', { name: 'nsfr-weekly' })
  async runNsfrWeeklyCheck(): Promise<void> {
    await this.executeScheduledRun('NSFR_WEEKLY_CHECK');
  }

  @Cron('0 8 1 1,4,7,10 *', { name: 'basel-quarterly' })
  async runBaselCapitalQuarterly(): Promise<void> {
    await this.executeScheduledRun('BASEL_CAPITAL_ADEQUACY');
  }

  @Cron('0 9 1 2 *', { name: 'ccar-annual' })
  async runCcarAnnual(): Promise<void> {
    await this.executeScheduledRun('CCAR_SEVERELY_ADVERSE');
    await this.executeScheduledRun('CCAR_ADVERSE');
    await this.executeScheduledRun('CCAR_BASELINE');
  }

  @Cron('0 9 15 3 *', { name: 'dfast-annual' })
  async runDfastAnnual(): Promise<void> {
    await this.executeScheduledRun('DFAST_ANNUAL');
  }

  @Cron('0 7 1 * *', { name: 'finra-net-capital-monthly' })
  async runFinraNetCapitalMonthly(): Promise<void> {
    await this.executeScheduledRun('FINRA_NET_CAPITAL');
  }

  @Cron('0 8 15 1,4,7,10 *', { name: 'finra-focus-quarterly' })
  async runFinraFocusQuarterly(): Promise<void> {
    await this.executeScheduledRun('FINRA_FOCUS_REPORT');
  }

  @Cron('0 9 1 2,5,8,11 *', { name: 'sec-13f-quarterly' })
  async runSec13fQuarterly(): Promise<void> {
    await this.executeScheduledRun('SEC_FORM_13F');
  }

  @Cron('0 9 1 4 *', { name: 'sec-adv-annual' })
  async runSecAdvAnnual(): Promise<void> {
    await this.executeScheduledRun('SEC_FORM_ADV');
  }

  @Cron('0 9 15 2,5,8,11 *', { name: 'sec-rule606-quarterly' })
  async runSecRule606Quarterly(): Promise<void> {
    await this.executeScheduledRun('SEC_RULE_606');
  }

  @Cron('0 6 3 * *', { name: 'fincen-sar-monthly' })
  async runFincenSarMonthly(): Promise<void> {
    await this.executeScheduledRun('FINCEN_SAR_EXPORT');
  }

  @Cron('0 6 * * 2', { name: 'fincen-ctr-weekly' })
  async runFincenCtrWeekly(): Promise<void> {
    await this.executeScheduledRun('FINCEN_CTR_EXPORT');
  }

  @Cron('0 8 5 1,4,7,10 *', { name: 'fincen-bsa-quarterly' })
  async runFincenBsaQuarterly(): Promise<void> {
    await this.executeScheduledRun('FINCEN_BSA_AGGREGATE');
  }

  @Cron('0 9 1 3 *', { name: 'fincen-fbar-annual' })
  async runFbarAnnual(): Promise<void> {
    await this.executeScheduledRun('FINCEN_FBAR');
  }

  @Cron('0 9 1 1 *', { name: 'fincen-boi-annual' })
  async runBoiAnnualReview(): Promise<void> {
    await this.executeScheduledRun('FINCEN_BOI_ANNUAL_REVIEW');
  }

  // ── Core execution engine ─────────────────────────────────────────────────

  private async executeScheduledRun(
    reportType: ReportType,
    triggeredBy: 'SCHEDULER' | 'MANUAL' = 'SCHEDULER',
    userId?: string,
  ): Promise<ReportRun> {
    const run: ReportRun = {
      runId: uuidv4(),
      reportType,
      scheduledAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      status: 'RUNNING',
      triggeredBy,
      triggeredByUserId: userId,
    };

    this.runHistory.push(run);
    const schedule = REPORT_SCHEDULES[reportType];

    this.logger.log(`[${triggeredBy}] Starting report: ${reportType} (${run.runId})`);

    try {
      const start = Date.now();

      // In a real system, these would call the respective services with
      // real data sources. Here we record the run as queued/completed.
      // The actual report generation is invoked by the API endpoints.

      run.status = 'COMPLETED';
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - start;
      run.reportReference = `${reportType}-${run.runId.slice(0, 8)}`;

      this.logger.log(`Completed: ${reportType} in ${run.durationMs}ms (runId: ${run.runId})`);
    } catch (err: unknown) {
      run.status = 'FAILED';
      run.completedAt = new Date().toISOString();
      run.errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed: ${reportType} — ${run.errorMessage}`);
    }

    // Keep last 500 runs in memory
    if (this.runHistory.length > 500) {
      this.runHistory = this.runHistory.slice(-500);
    }

    return run;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  manualTrigger(input: ManualTriggerInput): Promise<ReportRun> {
    return this.executeScheduledRun(input.reportType, 'MANUAL', input.triggeredByUserId);
  }

  getSchedule(): Array<ScheduledReport & { upcomingRuns: string[] }> {
    return Object.values(REPORT_SCHEDULES).map((s) => ({
      ...s,
      nextRunAt: this.computeNextRun(s.cronExpression),
      upcomingRuns: this.computeUpcomingRuns(s.cronExpression, 3),
      lastRunAt: this.runHistory
        .filter((r) => r.reportType === s.reportType && r.status === 'COMPLETED')
        .at(-1)?.completedAt,
    }));
  }

  getRunHistory(
    reportType?: ReportType,
    limit = 50,
  ): ReportRun[] {
    const filtered = reportType
      ? this.runHistory.filter((r) => r.reportType === reportType)
      : this.runHistory;
    return filtered.slice(-limit).reverse();
  }

  getOverdueReports(): Array<{ reportType: ReportType; description: string; lastRunAt?: string; overdueSince: string }> {
    const now = new Date();
    const overdue: Array<{ reportType: ReportType; description: string; lastRunAt?: string; overdueSince: string }> = [];

    for (const [type, schedule] of Object.entries(REPORT_SCHEDULES)) {
      if (!schedule.enabled) continue;

      const lastRun = this.runHistory
        .filter((r) => r.reportType === (type as ReportType) && r.status === 'COMPLETED')
        .at(-1);

      const maxGapMs = this.frequencyToMaxGapMs(schedule.frequency);
      const lastRunTime = lastRun ? new Date(lastRun.completedAt!).getTime() : 0;

      if (now.getTime() - lastRunTime > maxGapMs) {
        const overdueSince = lastRun
          ? new Date(lastRunTime + maxGapMs).toISOString()
          : 'Never run';

        overdue.push({
          reportType: type as ReportType,
          description: schedule.description,
          lastRunAt: lastRun?.completedAt,
          overdueSince,
        });
      }
    }

    return overdue;
  }

  getComplianceCalendar(year?: number): Array<{
    reportType: ReportType;
    frequency: ReportFrequency;
    regulatoryAuthority: string;
    description: string;
    nextDeadline: string;
    deadlineDaysAfterPeriod: number;
  }> {
    return Object.values(REPORT_SCHEDULES)
      .filter((s) => s.enabled)
      .map((s) => ({
        reportType: s.reportType,
        frequency: s.frequency,
        regulatoryAuthority: s.regulatoryAuthority,
        description: s.description,
        nextDeadline: this.computeNextRun(s.cronExpression),
        deadlineDaysAfterPeriod: s.deadlineDaysAfterPeriod,
      }))
      .sort((a, b) => a.nextDeadline.localeCompare(b.nextDeadline));
  }

  enableReport(reportType: ReportType, enabled: boolean): { reportType: ReportType; enabled: boolean } {
    const schedule = REPORT_SCHEDULES[reportType];
    if (schedule) {
      schedule.enabled = enabled;
    }
    return { reportType, enabled };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private computeNextRun(cronExpression: string): string {
    // Simplified next-run estimation based on frequency pattern
    // Production: use `cron` or `croner` package for precise next-run computation
    const now = new Date();
    const parts = cronExpression.split(' ');
    const hour = parseInt(parts[1], 10) || 0;
    const dom = parts[2];
    const month = parts[3];
    const dow = parts[4];

    const next = new Date(now);
    next.setMinutes(parseInt(parts[0], 10) || 0, 0, 0);
    next.setHours(hour);

    if (dom !== '*' && !dom.includes(',')) {
      next.setDate(parseInt(dom, 10));
    }
    if (month !== '*' && !month.includes(',')) {
      next.setMonth(parseInt(month, 10) - 1);
    }

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.toISOString();
  }

  private computeUpcomingRuns(cronExpression: string, count: number): string[] {
    const runs: string[] = [];
    let base = new Date();
    for (let i = 0; i < count; i++) {
      base = new Date(base.getTime() + this.frequencyToMaxGapMs('MONTHLY'));
      runs.push(base.toISOString().split('T')[0]);
    }
    return runs;
  }

  private frequencyToMaxGapMs(freq: ReportFrequency): number {
    const DAY = 86400000;
    switch (freq) {
      case 'DAILY': return DAY * 2;
      case 'WEEKLY': return DAY * 9;
      case 'MONTHLY': return DAY * 35;
      case 'QUARTERLY': return DAY * 95;
      case 'SEMI_ANNUAL': return DAY * 190;
      case 'ANNUAL': return DAY * 370;
      default: return DAY * 365;
    }
  }
}
