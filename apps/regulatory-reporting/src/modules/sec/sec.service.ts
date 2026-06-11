import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

// ── Form 13F ──────────────────────────────────────────────────────────────────

export interface Form13FHolding {
  /** Name of the issuer */
  nameOfIssuer: string;
  /** 13F security class: COM = common stock, PRF = preferred, PUT, CALL, etc. */
  titleOfClass: string;
  cusip: string;
  /** Market value in thousands of USD */
  marketValueThousands: number;
  /** Number of shares or principal amount */
  sharesOrPrincipalAmount: number;
  sharesOrPrincipalType: 'SH' | 'PRN';  // SH = shares, PRN = principal amount
  /** Investment discretion: SOLE, SHARED, OTHER */
  investmentDiscretion: 'SOLE' | 'SHARED' | 'OTHER';
  /** Other managers (for SHARED discretion) */
  otherManagers?: number[];
  /** Voting authority */
  votingSole: number;
  votingShared: number;
  votingNone: number;
}

export interface Form13FInput {
  managerName: string;
  cikNumber: string;
  reportingPeriodEnd: string;    // last day of calendar quarter, ISO date
  reportType: 'NEW' | 'AMENDED' | 'CONFIDENTIAL';
  holdings: Form13FHolding[];
  includeConfidentialOmitted?: boolean;
  /** SEC required: have any holdings been omitted for confidential treatment? */
  confidentialTreatmentRequested?: boolean;
}

// ── Form ADV ──────────────────────────────────────────────────────────────────

export interface FormAdvInput {
  adviserName: string;
  secRegistrationNumber: string;
  crdNumber: string;
  reportingDate: string;
  // Part 1A key fields
  businessDetails: {
    primaryBusinessDescription: string;
    officeCount: number;
    employeeCount: number;
    iaEmployeeCount: number;
  };
  assetsUnderManagement: {
    discretionaryAum: number;
    nonDiscretionaryAum: number;
    totalAum: number;
    accountCount: number;
  };
  clientTypes: Array<{ clientType: string; percentageOfClients: number }>;
  advisoryServices: string[];
  // Part 2A brochure summary
  feeSchedule: {
    assetBasedFeeRate?: number;    // e.g. 0.01 = 1% of AUM
    performanceFeeRate?: number;
    minimumFee?: number;
    hourlyRate?: number;
    description: string;
  };
  disclosures: {
    criminalActions: boolean;
    regulatoryActions: boolean;
    civilJudgements: boolean;
    anyDisclosures: boolean;
  };
}

// ── Rule 606 (Order Routing) ──────────────────────────────────────────────────

export interface Rule606VenueStats {
  venueName: string;
  venueType: 'EXCHANGE' | 'MARKET_MAKER' | 'ECN' | 'ATS' | 'WHOLESALE_BROKER';
  totalOrdersRouted: number;
  marketOrders: number;
  limitOrders: number;
  marketableOrders: number;
  nonMarketableOrders: number;
  netPaymentReceived?: number;    // payment for order flow received (negative = payment made)
  paymentPerShare?: number;       // cents per share
}

export interface Rule606Input {
  firmName: string;
  crdNumber?: string;
  reportingQuarter: string;        // e.g. 'Q1 2025'
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  securityType: 'EQUITY' | 'OPTION';
  venues: Rule606VenueStats[];
}

// ── Form N-PORT (monthly portfolio reporting) ─────────────────────────────────

export interface NPortHolding {
  name: string;
  lei?: string;
  cusip?: string;
  isin?: string;
  assetType: string;
  quantity: number;
  marketValue: number;
  percentageOfNetAssets: number;
  currency: string;
  maturityDate?: string;
  couponRate?: number;
  creditRating?: string;
}

export interface NPortInput {
  fundName: string;
  cikNumber: string;
  seriesId: string;
  reportingDate: string;
  netAssets: number;
  totalAssets: number;
  borrowings: number;
  holdings: NPortHolding[];
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface Form13FReport {
  reportId: string;
  managerName: string;
  cikNumber: string;
  reportingPeriodEnd: string;
  reportType: string;
  generatedAt: string;
  filingDeadline: string;         // 45 days after quarter end
  summaryPage: {
    totalHoldings: number;
    totalMarketValueThousands: number;
    confidentialTreatmentRequested: boolean;
  };
  holdings: Form13FHolding[];
  regulatoryNotes: string[];
}

export interface FormAdvReport {
  reportId: string;
  adviserName: string;
  secRegistrationNumber: string;
  reportingDate: string;
  generatedAt: string;
  part1Summary: {
    totalAum: number;
    discretionaryAum: number;
    nonDiscretionaryAum: number;
    accountCount: number;
    officeCount: number;
    employeeCount: number;
    registrationThresholdMet: boolean;   // $110M+ in AUM for SEC registration
  };
  feeDisclosure: FormAdvInput['feeSchedule'];
  disclosureItems: FormAdvInput['disclosures'];
  clientBreakdown: FormAdvInput['clientTypes'];
  advisoryServices: string[];
  regulatoryNotes: string[];
}

export interface Rule606Report {
  reportId: string;
  firmName: string;
  reportingQuarter: string;
  generatedAt: string;
  securityType: string;
  totalOrdersRouted: number;
  topVenuesByOrders: Rule606VenueStats[];
  venueConcentration: Array<{ venueName: string; orderShare: number; paymentPerShare?: number }>;
  totalNetPaymentReceived: number;
  paymentForOrderFlowDisclosure: string;
  regulatoryNotes: string[];
}

export interface NPortReport {
  reportId: string;
  fundName: string;
  reportingDate: string;
  generatedAt: string;
  filingDeadline: string;          // 30 days after month end
  netAssets: number;
  totalAssets: number;
  leverage: number;
  holdingCount: number;
  assetTypeBreakdown: Array<{ assetType: string; marketValue: number; percentage: number }>;
  topHoldings: NPortHolding[];
}

@Injectable()
export class SecService {

  // ── Form 13F ──────────────────────────────────────────────────────────────

  generateForm13F(input: Form13FInput): Form13FReport {
    const notes: string[] = [];

    const totalMarketValue = input.holdings.reduce((s, h) => s + h.marketValueThousands, 0);

    // Filing deadline: 45 days after reporting period end
    const periodEnd = new Date(input.reportingPeriodEnd);
    const deadline = new Date(periodEnd);
    deadline.setDate(deadline.getDate() + 45);

    if (totalMarketValue < 100_000) {
      notes.push('WARNING: Form 13F is required only for managers with ≥ $100M in qualifying 13(f) securities. Total market value is below threshold.');
    } else {
      notes.push(`Form 13F required: total holdings ${totalMarketValue.toLocaleString()} ($000) exceeds $100M threshold.`);
    }

    if (input.confidentialTreatmentRequested) {
      notes.push('Confidential treatment requested for certain holdings per Rule 13f-1(b). Separate application to SEC required.');
    }

    notes.push(`Filing deadline: ${deadline.toISOString().split('T')[0]} (45 calendar days after quarter end ${input.reportingPeriodEnd}).`);

    const reportId = `SEC-13F-${input.cikNumber}-${input.reportingPeriodEnd.replaceAll('-', '')}`;

    return {
      reportId,
      managerName: input.managerName,
      cikNumber: input.cikNumber,
      reportingPeriodEnd: input.reportingPeriodEnd,
      reportType: input.reportType,
      generatedAt: new Date().toISOString(),
      filingDeadline: deadline.toISOString().split('T')[0],
      summaryPage: {
        totalHoldings: input.holdings.length,
        totalMarketValueThousands: totalMarketValue,
        confidentialTreatmentRequested: input.confidentialTreatmentRequested ?? false,
      },
      holdings: input.holdings,
      regulatoryNotes: notes,
    };
  }

  // ── Form ADV ──────────────────────────────────────────────────────────────

  generateFormAdv(input: FormAdvInput): FormAdvReport {
    const notes: string[] = [];

    const totalAum = input.assetsUnderManagement.totalAum;
    const registrationThreshold = 110_000_000; // $110M — threshold for SEC vs state registration

    if (totalAum < registrationThreshold) {
      notes.push(`AUM ${totalAum.toLocaleString()} is below the $110M threshold. Consider state-level IA registration instead of SEC.`);
    } else {
      notes.push(`SEC registration threshold met: AUM $${(totalAum / 1e6).toFixed(1)}M ≥ $110M.`);
    }

    if (input.disclosures.anyDisclosures) {
      notes.push('DISCLOSURE: Disciplinary/legal events exist. Full details required in Part 2A brochure and DRP section.');
    }

    notes.push('Annual Form ADV amendment due within 90 days of fiscal year end (17 CFR 279.1, Rule 204-1).');

    const reportId = `SEC-ADV-${input.secRegistrationNumber}-${input.reportingDate.replaceAll('-', '')}`;

    return {
      reportId,
      adviserName: input.adviserName,
      secRegistrationNumber: input.secRegistrationNumber,
      reportingDate: input.reportingDate,
      generatedAt: new Date().toISOString(),
      part1Summary: {
        totalAum,
        discretionaryAum: input.assetsUnderManagement.discretionaryAum,
        nonDiscretionaryAum: input.assetsUnderManagement.nonDiscretionaryAum,
        accountCount: input.assetsUnderManagement.accountCount,
        officeCount: input.businessDetails.officeCount,
        employeeCount: input.businessDetails.employeeCount,
        registrationThresholdMet: totalAum >= registrationThreshold,
      },
      feeDisclosure: input.feeSchedule,
      disclosureItems: input.disclosures,
      clientBreakdown: input.clientTypes,
      advisoryServices: input.advisoryServices,
      regulatoryNotes: notes,
    };
  }

  // ── Rule 606 Order Routing Report ─────────────────────────────────────────

  generateRule606Report(input: Rule606Input): Rule606Report {
    const notes: string[] = [];

    const totalOrders = input.venues.reduce((s, v) => s + v.totalOrdersRouted, 0);
    const totalPayment = input.venues.reduce((s, v) => s + (v.netPaymentReceived ?? 0), 0);

    const venueShares = input.venues
      .map((v) => ({
        venueName: v.venueName,
        orderShare: totalOrders > 0 ? v.totalOrdersRouted / totalOrders : 0,
        paymentPerShare: v.paymentPerShare,
      }))
      .sort((a, b) => b.orderShare - a.orderShare);

    const topVenue = venueShares[0];
    if (topVenue && topVenue.orderShare > 0.50) {
      notes.push(`Concentration: ${topVenue.venueName} received ${(topVenue.orderShare * 100).toFixed(1)}% of orders. Best execution documentation required.`);
    }

    if (totalPayment > 0) {
      notes.push(`Net payment for order flow received: $${totalPayment.toLocaleString()}. Disclosure required per Rule 10b-10 and FINRA Rule 2267.`);
    }

    notes.push('Rule 606 reports are public and must be posted on firm website within 1 month after quarter end.');

    const reportId = `SEC-606-${input.crdNumber ?? 'UNKNOWN'}-${input.reportingQuarter.replace(/\s+/g, '-')}`;

    return {
      reportId,
      firmName: input.firmName,
      reportingQuarter: input.reportingQuarter,
      generatedAt: new Date().toISOString(),
      securityType: input.securityType,
      totalOrdersRouted: totalOrders,
      topVenuesByOrders: [...input.venues].sort((a, b) => b.totalOrdersRouted - a.totalOrdersRouted).slice(0, 5),
      venueConcentration: venueShares,
      totalNetPaymentReceived: totalPayment,
      paymentForOrderFlowDisclosure:
        totalPayment !== 0
          ? `The firm received net payment for order flow of $${Math.abs(totalPayment).toLocaleString()} during the period. This may present a conflict of interest.`
          : 'The firm did not receive net payment for order flow during the period.',
      regulatoryNotes: notes,
    };
  }

  // ── Form N-PORT ───────────────────────────────────────────────────────────

  generateNPort(input: NPortInput): NPortReport {
    const reportDate = new Date(input.reportingDate);
    const deadline = new Date(reportDate);
    deadline.setDate(deadline.getDate() + 30);

    const assetTypeMap = new Map<string, number>();
    for (const h of input.holdings) {
      assetTypeMap.set(h.assetType, (assetTypeMap.get(h.assetType) ?? 0) + h.marketValue);
    }

    const assetBreakdown = Array.from(assetTypeMap.entries()).map(([type, value]) => ({
      assetType: type,
      marketValue: value,
      percentage: input.totalAssets > 0 ? value / input.totalAssets : 0,
    })).sort((a, b) => b.marketValue - a.marketValue);

    const topHoldings = [...input.holdings]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 20);

    const leverage = input.netAssets > 0 ? input.totalAssets / input.netAssets : 1;

    const reportId = `SEC-NPORT-${input.cikNumber}-${input.seriesId}-${input.reportingDate.replaceAll('-', '')}`;

    return {
      reportId,
      fundName: input.fundName,
      reportingDate: input.reportingDate,
      generatedAt: new Date().toISOString(),
      filingDeadline: deadline.toISOString().split('T')[0],
      netAssets: input.netAssets,
      totalAssets: input.totalAssets,
      leverage,
      holdingCount: input.holdings.length,
      assetTypeBreakdown: assetBreakdown,
      topHoldings,
    };
  }

  // ── Regulatory filing calendar ────────────────────────────────────────────

  getFilingCalendar(referenceDate?: string) {
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    const year = ref.getFullYear();
    const month = ref.getMonth();

    const quarterEnds = [
      new Date(year, 2, 31),  // Q1: March 31
      new Date(year, 5, 30),  // Q2: June 30
      new Date(year, 8, 30),  // Q3: September 30
      new Date(year, 11, 31), // Q4: December 31
    ];

    return {
      form13F: quarterEnds.map((qe) => {
        const deadline = new Date(qe);
        deadline.setDate(deadline.getDate() + 45);
        return { quarterEnd: qe.toISOString().split('T')[0], deadline: deadline.toISOString().split('T')[0], form: 'Form 13F' };
      }),
      rule606: quarterEnds.map((qe) => {
        const deadline = new Date(qe);
        deadline.setMonth(deadline.getMonth() + 1);
        return { quarterEnd: qe.toISOString().split('T')[0], deadline: deadline.toISOString().split('T')[0], form: 'Rule 606' };
      }),
      formAdvAmendment: { deadline: `Within 90 days of fiscal year end`, form: 'Form ADV Annual Amendment' },
      nPort: { frequency: 'Monthly (30 days after month end)', form: 'Form N-PORT' },
      formCrs: { frequency: 'Annual review required', form: 'Form CRS (Customer Relationship Summary)' },
    };
  }

  getRegulatoryReference() {
    return {
      form13F: 'Section 13(f) of the Securities Exchange Act of 1934; Rule 13f-1. Required for managers with ≥$100M in 13(f) securities. Filed 45 days after quarter end.',
      formAdv: 'Investment Advisers Act of 1940, Section 203; Rule 204-1. Annual amendment within 90 days of FY end.',
      rule606: 'SEC Rule 606 (formerly Rule 11Ac1-6). Quarterly order routing disclosure for NMS securities.',
      nPort: 'SEC Rule N-PORT under the Investment Company Act. Monthly portfolio reporting for registered funds.',
      formBd: 'SEC Form BD — Broker-Dealer registration, updated within 30 days of material changes.',
      reg13DG: 'Schedule 13D/13G — beneficial ownership reporting for ≥5% stakes within 10/45 days of crossing threshold.',
      shortSaleReporting: 'Rule 10a-1 and FINRA Rule 4560 — short position reporting twice monthly.',
    };
  }

  generateFilingId(): string {
    return uuidv4();
  }
}
