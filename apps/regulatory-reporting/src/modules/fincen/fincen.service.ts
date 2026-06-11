import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

// ── SAR batch export ──────────────────────────────────────────────────────────

export interface SarRecord {
  sarId: string;
  filingInstitution: string;
  reportingDate: string;
  suspiciousActivityDate: string;
  subjectName?: string;
  subjectTin?: string;          // taxpayer ID (masked)
  subjectDateOfBirth?: string;
  suspiciousActivityAmount: number;
  suspiciousActivityType: SarActivityType;
  narrativeSummary: string;     // truncated — full narrative in compliance system
  filedByUserId: string;
  reviewedByUserId: string;
  filingStatus: 'DRAFT' | 'FILED' | 'ACKNOWLEDGED';
  finCenBsaId?: string;         // FinCEN tracking number after acknowledgement
}

export type SarActivityType =
  | 'STRUCTURING'
  | 'MONEY_LAUNDERING'
  | 'FRAUD'
  | 'IDENTITY_THEFT'
  | 'TERRORIST_FINANCING'
  | 'CYBER_CRIME'
  | 'MORTGAGE_FRAUD'
  | 'INSIDER_ABUSE'
  | 'OTHER';

// ── CTR batch export ──────────────────────────────────────────────────────────

export interface CtrRecord {
  ctrId: string;
  filingInstitution: string;
  transactionDate: string;
  transactionAmount: number;
  transactionType: 'CASH_IN' | 'CASH_OUT' | 'BOTH';
  customerName: string;
  customerTin?: string;          // masked
  customerDateOfBirth?: string;
  conductedByThirdParty: boolean;
  thirdPartyName?: string;
  accountNumbers: string[];
  filingStatus: 'DRAFT' | 'FILED' | 'ACKNOWLEDGED';
  finCenBsaId?: string;
  filedDate?: string;
}

// ── FBAR (FinCEN 114) ─────────────────────────────────────────────────────────

export interface FbarForeignAccount {
  accountNumber: string;         // masked
  financialInstitutionName: string;
  country: string;               // ISO country code
  accountType: 'BANK' | 'SECURITIES' | 'OTHER_FINANCIAL';
  maxValueDuringYear: number;    // USD equivalent of maximum balance
  currency: string;
  jointAccountHolder?: string;
}

export interface FbarInput {
  filingYear: number;
  filerName: string;
  filerTin: string;              // masked
  filerType: 'INDIVIDUAL' | 'CORPORATION' | 'PARTNERSHIP' | 'TRUST' | 'OTHER';
  accounts: FbarForeignAccount[];
  hasSignatoryAuthority: boolean;
  filingDeadlineExtension?: boolean;
}

// ── BSA aggregate report ──────────────────────────────────────────────────────

export interface BsaAggregateInput {
  institutionName: string;
  filingPeriodStart: string;
  filingPeriodEnd: string;
  sars: SarRecord[];
  ctrs: CtrRecord[];
}

// ── Beneficial Ownership (CTA/BOI) ────────────────────────────────────────────

export interface BeneficialOwner {
  fullLegalName: string;
  dateOfBirth: string;
  residentialAddress: string;
  identifyingDocument: {
    type: 'PASSPORT' | 'STATE_ID' | 'DRIVERS_LICENSE';
    number: string;           // masked after submission
    issuingJurisdiction: string;
    expirationDate?: string;
  };
  ownershipPercentage?: number;
  controlType: 'OWNERSHIP_25_PCT' | 'SIGNIFICANT_CONTROL';
}

export interface BoiReportInput {
  companyLegalName: string;
  ein?: string;
  stateOfFormation: string;
  dateOfFormation: string;
  reportType: 'INITIAL' | 'UPDATED' | 'CORRECTION';
  exemptFromReporting?: boolean;
  exemptionBasis?: string;
  beneficialOwners: BeneficialOwner[];
  companyApplicants?: BeneficialOwner[];
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface SarBatchExport {
  exportId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totalSars: number;
  filedCount: number;
  draftCount: number;
  overdueCount: number;           // > 30 days from suspicious activity without filing
  byActivityType: Array<{ type: string; count: number; totalAmount: number }>;
  records: SarRecord[];
  regulatoryNotes: string[];
}

export interface CtrBatchExport {
  exportId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totalCtrs: number;
  filedCount: number;
  draftCount: number;
  overdueCount: number;           // > 15 calendar days from transaction
  totalCashIn: number;
  totalCashOut: number;
  records: CtrRecord[];
  regulatoryNotes: string[];
}

export interface FbarReport {
  reportId: string;
  generatedAt: string;
  filingDeadline: string;         // April 15 (auto-extension to October 15)
  filerName: string;
  filingYear: number;
  accountCount: number;
  aggregateMaxValue: number;
  reportingRequired: boolean;     // true if aggregate > $10,000
  accounts: FbarForeignAccount[];
  regulatoryNotes: string[];
}

export interface BsaAggregateReport {
  reportId: string;
  institutionName: string;
  filingPeriodStart: string;
  filingPeriodEnd: string;
  generatedAt: string;
  sarSummary: {
    total: number;
    filed: number;
    pending: number;
    byType: Array<{ type: string; count: number; totalAmount: number }>;
    averageFilingDays: number;
  };
  ctrSummary: {
    total: number;
    filed: number;
    pending: number;
    totalCashIn: number;
    totalCashOut: number;
    averageFilingDays: number;
  };
  bsaComplianceScore: number;     // 0–100 composite score
  regulatoryNotes: string[];
}

export interface BoiReport {
  reportId: string;
  companyLegalName: string;
  reportType: string;
  generatedAt: string;
  filingDeadline: string;
  beneficialOwnerCount: number;
  beneficialOwners: Array<{
    fullLegalName: string;
    controlType: string;
    ownershipPercentage?: number;
    documentsVerified: boolean;
  }>;
  exemptFromReporting: boolean;
  exemptionBasis?: string;
  regulatoryNotes: string[];
}

@Injectable()
export class FincenService {

  // ── SAR batch export ──────────────────────────────────────────────────────

  exportSarBatch(
    sars: SarRecord[],
    periodStart: string,
    periodEnd: string,
  ): SarBatchExport {
    const notes: string[] = [];
    const now = new Date();

    // Check for overdue SARs (30-day deadline from suspicious activity)
    const overdue = sars.filter((sar) => {
      if (sar.filingStatus === 'FILED' || sar.filingStatus === 'ACKNOWLEDGED') return false;
      const activityDate = new Date(sar.suspiciousActivityDate);
      const daysElapsed = (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysElapsed > 30;
    });

    if (overdue.length > 0) {
      notes.push(`WARNING: ${overdue.length} SAR(s) overdue (>30 days from suspicious activity date). Immediate filing required.`);
    }

    // Group by activity type
    const typeMap = new Map<string, { count: number; totalAmount: number }>();
    for (const sar of sars) {
      const existing = typeMap.get(sar.suspiciousActivityType) ?? { count: 0, totalAmount: 0 };
      typeMap.set(sar.suspiciousActivityType, {
        count: existing.count + 1,
        totalAmount: existing.totalAmount + sar.suspiciousActivityAmount,
      });
    }

    notes.push(`SAR filing deadline: 30 calendar days from initial detection (60 days if no identified subject). BSA/AML Rule 31 CFR 1020.320.`);
    notes.push(`Late SARs must include explanation of delay. Regulators may request records for 5-year retention period.`);

    return {
      exportId: `FINCEN-SAR-BATCH-${uuidv4().slice(0, 8).toUpperCase()}`,
      generatedAt: now.toISOString(),
      periodStart,
      periodEnd,
      totalSars: sars.length,
      filedCount: sars.filter((s) => s.filingStatus !== 'DRAFT').length,
      draftCount: sars.filter((s) => s.filingStatus === 'DRAFT').length,
      overdueCount: overdue.length,
      byActivityType: Array.from(typeMap.entries()).map(([type, stats]) => ({ type, ...stats })),
      records: sars,
      regulatoryNotes: notes,
    };
  }

  // ── CTR batch export ──────────────────────────────────────────────────────

  exportCtrBatch(
    ctrs: CtrRecord[],
    periodStart: string,
    periodEnd: string,
  ): CtrBatchExport {
    const notes: string[] = [];
    const now = new Date();

    // CTR deadline: 15 calendar days from transaction date
    const overdue = ctrs.filter((ctr) => {
      if (ctr.filingStatus !== 'DRAFT') return false;
      const txDate = new Date(ctr.transactionDate);
      const daysElapsed = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysElapsed > 15;
    });

    if (overdue.length > 0) {
      notes.push(`WARNING: ${overdue.length} CTR(s) overdue (>15 days from transaction). Immediate filing required.`);
    }

    const totalCashIn = ctrs
      .filter((c) => c.transactionType === 'CASH_IN' || c.transactionType === 'BOTH')
      .reduce((s, c) => s + c.transactionAmount, 0);
    const totalCashOut = ctrs
      .filter((c) => c.transactionType === 'CASH_OUT' || c.transactionType === 'BOTH')
      .reduce((s, c) => s + c.transactionAmount, 0);

    notes.push(`CTR threshold: $10,000 in cash in a single day. All transactions ≥$10,000 must be reported within 15 days. BSA 31 CFR 1010.311.`);
    notes.push(`Structuring to avoid CTR reporting is a federal crime (31 U.S.C. § 5324). Related SARs should be filed if structuring suspected.`);

    return {
      exportId: `FINCEN-CTR-BATCH-${uuidv4().slice(0, 8).toUpperCase()}`,
      generatedAt: now.toISOString(),
      periodStart,
      periodEnd,
      totalCtrs: ctrs.length,
      filedCount: ctrs.filter((c) => c.filingStatus !== 'DRAFT').length,
      draftCount: ctrs.filter((c) => c.filingStatus === 'DRAFT').length,
      overdueCount: overdue.length,
      totalCashIn,
      totalCashOut,
      records: ctrs,
      regulatoryNotes: notes,
    };
  }

  // ── FBAR (FinCEN 114) ─────────────────────────────────────────────────────

  generateFbarReport(input: FbarInput): FbarReport {
    const notes: string[] = [];

    const aggregateMaxValue = input.accounts.reduce((s, a) => s + a.maxValueDuringYear, 0);
    const reportingRequired = aggregateMaxValue > 10_000;

    const filingYear = input.filingYear;
    const baseDeadline = `${filingYear + 1}-04-15`;
    const extensionDeadline = `${filingYear + 1}-10-15`;
    const filingDeadline = input.filingDeadlineExtension ? extensionDeadline : baseDeadline;

    if (!reportingRequired) {
      notes.push(`FBAR not required: aggregate maximum value $${aggregateMaxValue.toLocaleString()} does not exceed $10,000 threshold.`);
    } else {
      notes.push(`FBAR required: aggregate maximum value $${aggregateMaxValue.toLocaleString()} exceeds $10,000.`);
      notes.push(`Filing deadline: ${filingDeadline}. Automatic extension to October 15 available (no separate request needed).`);
    }

    if (input.hasSignatoryAuthority) {
      notes.push('Signatory authority accounts must be reported even without financial interest. 31 CFR 1010.350(b).');
    }

    const highValueAccounts = input.accounts.filter((a) => a.maxValueDuringYear > 10_000_000);
    if (highValueAccounts.length > 0) {
      notes.push(`${highValueAccounts.length} account(s) exceed $10M. FATCA Form 8938 may also be required.`);
    }

    return {
      reportId: `FINCEN-FBAR-${input.filingYear}-${uuidv4().slice(0, 8).toUpperCase()}`,
      generatedAt: new Date().toISOString(),
      filingDeadline,
      filerName: input.filerName,
      filingYear: input.filingYear,
      accountCount: input.accounts.length,
      aggregateMaxValue,
      reportingRequired,
      accounts: input.accounts,
      regulatoryNotes: notes,
    };
  }

  // ── BSA aggregate report ──────────────────────────────────────────────────

  generateBsaAggregateReport(input: BsaAggregateInput): BsaAggregateReport {
    const notes: string[] = [];

    const sarFiled = input.sars.filter((s) => s.filingStatus !== 'DRAFT').length;
    const sarPending = input.sars.length - sarFiled;
    const ctrFiled = input.ctrs.filter((c) => c.filingStatus !== 'DRAFT').length;
    const ctrPending = input.ctrs.length - ctrFiled;

    const sarTypeMap = new Map<string, { count: number; totalAmount: number }>();
    for (const sar of input.sars) {
      const existing = sarTypeMap.get(sar.suspiciousActivityType) ?? { count: 0, totalAmount: 0 };
      sarTypeMap.set(sar.suspiciousActivityType, { count: existing.count + 1, totalAmount: existing.totalAmount + sar.suspiciousActivityAmount });
    }

    const totalCashIn = input.ctrs.filter((c) => c.transactionType !== 'CASH_OUT').reduce((s, c) => s + c.transactionAmount, 0);
    const totalCashOut = input.ctrs.filter((c) => c.transactionType !== 'CASH_IN').reduce((s, c) => s + c.transactionAmount, 0);

    // BSA compliance score (0–100)
    const sarComplianceScore = input.sars.length > 0 ? (sarFiled / input.sars.length) * 100 : 100;
    const ctrComplianceScore = input.ctrs.length > 0 ? (ctrFiled / input.ctrs.length) * 100 : 100;
    const bsaComplianceScore = (sarComplianceScore + ctrComplianceScore) / 2;

    if (bsaComplianceScore < 95) {
      notes.push(`BSA compliance score ${bsaComplianceScore.toFixed(1)}/100 is below 95% threshold. Immediate remediation required.`);
    }
    if (sarPending > 0) notes.push(`${sarPending} SAR(s) pending — verify all are within 30-day filing window.`);
    if (ctrPending > 0) notes.push(`${ctrPending} CTR(s) pending — verify all are within 15-day filing window.`);

    return {
      reportId: `FINCEN-BSA-${uuidv4().slice(0, 8).toUpperCase()}`,
      institutionName: input.institutionName,
      filingPeriodStart: input.filingPeriodStart,
      filingPeriodEnd: input.filingPeriodEnd,
      generatedAt: new Date().toISOString(),
      sarSummary: {
        total: input.sars.length,
        filed: sarFiled,
        pending: sarPending,
        byType: Array.from(sarTypeMap.entries()).map(([type, stats]) => ({ type, ...stats })),
        averageFilingDays: 0, // would compute from actual filing dates
      },
      ctrSummary: {
        total: input.ctrs.length,
        filed: ctrFiled,
        pending: ctrPending,
        totalCashIn,
        totalCashOut,
        averageFilingDays: 0,
      },
      bsaComplianceScore,
      regulatoryNotes: notes,
    };
  }

  // ── Beneficial Ownership Information (CTA) ────────────────────────────────

  generateBoiReport(input: BoiReportInput): BoiReport {
    const notes: string[] = [];

    if (input.exemptFromReporting) {
      notes.push(`Company is exempt from BOI reporting. Basis: ${input.exemptionBasis ?? 'unspecified'}.`);
      notes.push('Exemptions include: large operating companies (>20 FTE, >$5M revenue, US physical presence), regulated entities, inactive companies, etc.');
    } else {
      if (input.beneficialOwners.length === 0) {
        notes.push('ERROR: At least one beneficial owner must be reported. If no individuals own/control ≥25%, report the senior officer.');
      }

      notes.push('CTA BOI report required under the Corporate Transparency Act (31 U.S.C. § 5336).');

      const filingDate = new Date(input.dateOfFormation);
      const isNew = (Date.now() - filingDate.getTime()) / (1000 * 60 * 60 * 24) < 30;
      const deadlineDays = isNew ? 30 : 0;
      notes.push(
        isNew
          ? `New company: BOI report due within 30 days of formation (deadline: ${new Date(filingDate.getTime() + 30 * 86400000).toISOString().split('T')[0]}).`
          : 'Existing company: initial BOI report was due January 1, 2025. Updates required within 30 days of changes.',
      );
    }

    const deadline = input.reportType === 'INITIAL'
      ? new Date(new Date(input.dateOfFormation).getTime() + 30 * 86400000).toISOString().split('T')[0]
      : 'Within 30 days of change';

    return {
      reportId: `FINCEN-BOI-${uuidv4().slice(0, 8).toUpperCase()}`,
      companyLegalName: input.companyLegalName,
      reportType: input.reportType,
      generatedAt: new Date().toISOString(),
      filingDeadline: deadline,
      beneficialOwnerCount: input.beneficialOwners.length,
      beneficialOwners: input.beneficialOwners.map((owner) => ({
        fullLegalName: owner.fullLegalName,
        controlType: owner.controlType,
        ownershipPercentage: owner.ownershipPercentage,
        documentsVerified: !!owner.identifyingDocument.number,
      })),
      exemptFromReporting: input.exemptFromReporting ?? false,
      exemptionBasis: input.exemptionBasis,
      regulatoryNotes: notes,
    };
  }

  // ── Regulatory reference ──────────────────────────────────────────────────

  getRegulatoryReference() {
    return {
      sar: {
        rule: '31 CFR 1020.320 (banks); 31 CFR 1023.320 (broker-dealers)',
        threshold: '$5,000 known/suspected; $25,000 unknown actor',
        deadline: '30 days from initial detection (60 days if no identified subject)',
        retention: '5 years from filing date',
      },
      ctr: {
        rule: '31 CFR 1010.311',
        threshold: '$10,000 in cash in a single business day',
        deadline: '15 calendar days from transaction',
        exemptions: 'Phase I (banks, governments) and Phase II (established businesses) exemptions available',
      },
      fbar: {
        rule: '31 CFR 1010.350; 31 U.S.C. § 5314',
        threshold: 'Aggregate >$10,000 at any point during calendar year',
        deadline: 'April 15 (auto-extension to October 15)',
        penalties: 'Up to $10,000 non-willful; greater of $100,000 or 50% account value willful',
      },
      bsa: {
        programRequirements: 'Written AML program, internal controls, independent testing, designated BSA officer, ongoing training',
        recordRetention: '5 years for most BSA records',
        examAuthority: 'FinCEN, prudential regulators (OCC, FDIC, FRB, state regulators)',
      },
      cta_boi: {
        rule: 'Corporate Transparency Act (31 U.S.C. § 5336); FinCEN Rule 31 CFR 1010.380',
        threshold: 'All non-exempt companies formed or registered in the US',
        deadline: 'Existing companies: Jan 1, 2025; New companies (formed 2024+): 30 days after formation',
        beneficialOwnerDefinition: 'Individual who directly/indirectly owns/controls ≥25% equity or exercises substantial control',
      },
    };
  }
}
