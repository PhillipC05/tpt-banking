import { Injectable } from '@nestjs/common';

// ── Capital input types ───────────────────────────────────────────────────────

export interface Cet1Components {
  commonStockAndSurplus: number;
  retainedEarnings: number;
  accumulatedOtherComprehensiveIncome: number;
  // Deductions
  goodwillAndIntangibles: number;
  deferredTaxAssets: number;
  significantInvestmentsInFinancialInstitutions: number;
  otherDeductions: number;
}

export interface AdditionalTier1Components {
  perpetualNonCumulativePreferredStock: number;
  contingentConvertibleBonds: number;
  otherAt1Instruments: number;
  at1Deductions: number;
}

export interface Tier2Components {
  subordinatedDebt: number;           // maturity > 5 years remaining
  allowanceForLoanLosses: number;     // capped at 1.25% of credit RWA
  otherT2Instruments: number;
  t2Deductions: number;
}

export interface CreditRwaExposure {
  description: string;
  assetClass: CreditAssetClass;
  exposureAmount: number;
  /** Override the standardized risk weight (0–1+). If omitted, uses Basel IV SA-CR. */
  customRiskWeight?: number;
  /** For IRBA: model-derived RWA */
  irbaRwa?: number;
}

export type CreditAssetClass =
  | 'SOVEREIGNS'
  | 'PSE_DOMESTIC'
  | 'MDB'
  | 'BANKS_INVESTMENT_GRADE'
  | 'BANKS_OTHER'
  | 'COVERED_BONDS'
  | 'CORPORATE_INVESTMENT_GRADE'
  | 'CORPORATE_OTHER'
  | 'REGULATORY_RETAIL'
  | 'RESIDENTIAL_MORTGAGE_LTV_50'
  | 'RESIDENTIAL_MORTGAGE_LTV_80'
  | 'RESIDENTIAL_MORTGAGE_LTV_100'
  | 'RESIDENTIAL_MORTGAGE_LTV_OVER_100'
  | 'COMMERCIAL_REAL_ESTATE'
  | 'SUBORDINATED_DEBT'
  | 'EQUITY_EXCHANGE_TRADED'
  | 'EQUITY_OTHER'
  | 'SECURITISATION_SENIOR_HIGH_QUALITY'
  | 'SECURITISATION_OTHER'
  | 'OTHER_ASSETS';

export interface MarketRwaInput {
  tradingBookVaR99_10day: number;
  stressedVaR99_10day: number;
  incrementalRiskCharge: number;
  comprehensiveRiskMeasure: number;
  /** FRTB (Basel IV): standardized approach for market risk */
  frtbSa?: number;
}

export interface OperationalRwaInput {
  /** Gross income (3-year average) for Basic Indicator Approach */
  grossIncome3YrAvg?: number;
  /** Business Indicator Component for Standardised Measurement Approach (Basel IV SMA) */
  businessIndicatorComponent?: number;
  /** Internal Loss Multiplier for SMA (1.0–min(5,ILM)) */
  internalLossMultiplier?: number;
  approach: 'BIA' | 'TSA' | 'SMA';
}

export interface LeverageExposure {
  onBalanceSheetExposures: number;
  derivativeExposures: number;
  securityFinancingTransactions: number;
  offBalanceSheetExposures: number;
}

export interface TlacInput {
  /** Total Loss-Absorbing Capacity instruments outstanding */
  tlacInstruments: number;
  /** External TLAC minimum: 16% of RWA (2019+) / 18% of RWA (2022+) */
  minimumTlacRwaRatio: number;
  /** External TLAC minimum: 6% of leverage ratio exposure */
  minimumTlacLevRatio: number;
}

export interface BaselCapitalInput {
  cet1: Cet1Components;
  at1: AdditionalTier1Components;
  t2: Tier2Components;
  creditRwaExposures: CreditRwaExposure[];
  marketRwa: MarketRwaInput;
  operationalRwa: OperationalRwaInput;
  leverageExposure: LeverageExposure;
  gSibSurcharge?: number;       // 0 | 0.01 | 0.015 | 0.02 | 0.025 | 0.035
  countercyclicalBuffer?: number;  // 0–0.025 (jurisdiction-specific)
  isGSib?: boolean;
  tlac?: TlacInput;
  /** Basel IV output floor: if true, RWA = max(irba_rwa, 0.725 * sa_rwa) */
  applyBaselIvOutputFloor?: boolean;
  reportingDate: string;        // ISO date string
  institutionName: string;
  leiCode?: string;             // Legal Entity Identifier
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface CapitalRatios {
  cet1Ratio: number;
  tier1Ratio: number;
  totalCapitalRatio: number;
  leverageRatio: number;
}

export interface CapitalRequirements {
  minimumCet1: number;          // 4.5%
  capitalConservationBuffer: number;  // 2.5%
  countercyclicalBuffer: number;      // 0–2.5%
  gSibSurcharge: number;        // 0–3.5%
  totalCet1Requirement: number; // sum of above
  minimumTier1: number;         // 6%
  minimumTotalCapital: number;  // 8%
  minimumLeverageRatio: number; // 3%
}

export interface CapitalBufferPosition {
  cet1Surplus: number;
  cet1BreachDistance: number;
  tier1Surplus: number;
  totalCapitalSurplus: number;
  leverageSurplus: number;
  distributionRestrictions: string | null;
}

export interface RwaBreakdown {
  creditRwa: number;
  marketRwa: number;
  operationalRwa: number;
  totalRwa: number;
  saRwa: number;
  outputFloorApplied: boolean;
  creditRwaByAssetClass: Array<{
    assetClass: string;
    description: string;
    exposure: number;
    riskWeight: number;
    rwa: number;
  }>;
}

export interface BaselCapitalReport {
  reportId: string;
  reportingDate: string;
  institutionName: string;
  leiCode: string | undefined;
  generatedAt: string;
  capitalComponents: {
    cet1Capital: number;
    additionalTier1: number;
    tier1Capital: number;
    tier2Capital: number;
    totalCapital: number;
  };
  rwaBreakdown: RwaBreakdown;
  capitalRatios: CapitalRatios;
  capitalRequirements: CapitalRequirements;
  bufferPosition: CapitalBufferPosition;
  leverageDetails: {
    tier1Capital: number;
    totalExposure: number;
    leverageRatio: number;
    minimumRequired: number;
    compliant: boolean;
  };
  tlacAssessment: TlacAssessment | null;
  complianceStatus: {
    cet1Compliant: boolean;
    tier1Compliant: boolean;
    totalCapitalCompliant: boolean;
    leverageCompliant: boolean;
    overallCompliant: boolean;
  };
  regulatoryNotes: string[];
}

export interface TlacAssessment {
  tlacInstruments: number;
  totalRwa: number;
  totalExposure: number;
  tlacRwaRatio: number;
  tlacLeverageRatio: number;
  minimumTlacRwa: number;
  minimumTlacLeverage: number;
  tlacRwaCompliant: boolean;
  tlacLeverageCompliant: boolean;
  shortfall: number;
}

// ── Basel IV SA-CR risk weights ───────────────────────────────────────────────

const SA_CR_RISK_WEIGHTS: Record<CreditAssetClass, number> = {
  SOVEREIGNS: 0,
  PSE_DOMESTIC: 0.20,
  MDB: 0,
  BANKS_INVESTMENT_GRADE: 0.40,
  BANKS_OTHER: 0.75,
  COVERED_BONDS: 0.10,
  CORPORATE_INVESTMENT_GRADE: 0.65,
  CORPORATE_OTHER: 1.00,
  REGULATORY_RETAIL: 0.75,
  RESIDENTIAL_MORTGAGE_LTV_50: 0.20,
  RESIDENTIAL_MORTGAGE_LTV_80: 0.30,
  RESIDENTIAL_MORTGAGE_LTV_100: 0.40,
  RESIDENTIAL_MORTGAGE_LTV_OVER_100: 0.70,
  COMMERCIAL_REAL_ESTATE: 1.00,
  SUBORDINATED_DEBT: 1.50,
  EQUITY_EXCHANGE_TRADED: 1.00,
  EQUITY_OTHER: 1.50,
  SECURITISATION_SENIOR_HIGH_QUALITY: 0.15,
  SECURITISATION_OTHER: 0.80,
  OTHER_ASSETS: 1.00,
};

let reportCounter = 0;

@Injectable()
export class BaselService {

  generateCapitalAdequacyReport(input: BaselCapitalInput): BaselCapitalReport {
    const notes: string[] = [];

    // ── Step 1: Compute capital tiers ──────────────────────────────────────
    const cet1Capital = this.computeCet1(input.cet1);
    const at1Capital = this.computeAt1(input.at1);
    const tier1Capital = cet1Capital + at1Capital;
    const t2Capital = this.computeT2(input.t2);
    const totalCapital = tier1Capital + t2Capital;

    // ── Step 2: Credit RWA (SA-CR, Basel IV) ──────────────────────────────
    const { creditRwa, saRwa, creditRows } = this.computeCreditRwa(
      input.creditRwaExposures,
      input.applyBaselIvOutputFloor ?? false,
      notes,
    );

    // ── Step 3: Market RWA ─────────────────────────────────────────────────
    const marketRwa = this.computeMarketRwa(input.marketRwa, notes);

    // ── Step 4: Operational RWA ────────────────────────────────────────────
    const operationalRwa = this.computeOperationalRwa(input.operationalRwa, notes);

    // ── Step 5: Total RWA with Basel IV output floor ───────────────────────
    const rawTotalRwa = creditRwa + marketRwa + operationalRwa;
    const saTotalRwa = saRwa + marketRwa + operationalRwa;
    let totalRwa = rawTotalRwa;
    let outputFloorApplied = false;

    if (input.applyBaselIvOutputFloor) {
      const floor = saTotalRwa * 0.725;
      if (rawTotalRwa < floor) {
        totalRwa = floor;
        outputFloorApplied = true;
        notes.push(
          `Basel IV output floor applied: model RWA (${rawTotalRwa.toFixed(0)}) ` +
          `< 72.5% of SA RWA (${floor.toFixed(0)}). Using floored RWA.`,
        );
      }
    }

    // ── Step 6: Capital ratios ─────────────────────────────────────────────
    const cet1Ratio = totalRwa > 0 ? cet1Capital / totalRwa : Infinity;
    const tier1Ratio = totalRwa > 0 ? tier1Capital / totalRwa : Infinity;
    const totalCapitalRatio = totalRwa > 0 ? totalCapital / totalRwa : Infinity;

    // ── Step 7: Leverage ratio ─────────────────────────────────────────────
    const totalExposure =
      input.leverageExposure.onBalanceSheetExposures +
      input.leverageExposure.derivativeExposures +
      input.leverageExposure.securityFinancingTransactions +
      input.leverageExposure.offBalanceSheetExposures;
    const leverageRatio = totalExposure > 0 ? tier1Capital / totalExposure : Infinity;

    // ── Step 8: Capital requirements ──────────────────────────────────────
    const ccyBuffer = input.countercyclicalBuffer ?? 0;
    const gSibSurcharge = input.gSibSurcharge ?? 0;
    const minimumCet1 = 0.045;
    const conservationBuffer = 0.025;
    const totalCet1Requirement = minimumCet1 + conservationBuffer + ccyBuffer + gSibSurcharge;

    const requirements: CapitalRequirements = {
      minimumCet1,
      capitalConservationBuffer: conservationBuffer,
      countercyclicalBuffer: ccyBuffer,
      gSibSurcharge,
      totalCet1Requirement,
      minimumTier1: 0.06,
      minimumTotalCapital: 0.08,
      minimumLeverageRatio: 0.03,
    };

    // ── Step 9: Compliance ─────────────────────────────────────────────────
    const cet1Compliant = cet1Ratio >= totalCet1Requirement;
    const tier1Compliant = tier1Ratio >= 0.06;
    const totalCapitalCompliant = totalCapitalRatio >= 0.08;
    const leverageCompliant = leverageRatio >= 0.03;
    const overallCompliant = cet1Compliant && tier1Compliant && totalCapitalCompliant && leverageCompliant;

    if (!cet1Compliant) notes.push(`CET1 BREACH: ${(cet1Ratio * 100).toFixed(2)}% < required ${(totalCet1Requirement * 100).toFixed(2)}%`);
    if (!tier1Compliant) notes.push(`Tier 1 BREACH: ${(tier1Ratio * 100).toFixed(2)}% < required 6%`);
    if (!totalCapitalCompliant) notes.push(`Total Capital BREACH: ${(totalCapitalRatio * 100).toFixed(2)}% < required 8%`);
    if (!leverageCompliant) notes.push(`Leverage Ratio BREACH: ${(leverageRatio * 100).toFixed(2)}% < required 3%`);

    // ── Step 10: Distribution restrictions (CRD IV / Basel III) ───────────
    const distributionRestrictions = this.computeDistributionRestrictions(
      cet1Ratio,
      totalCet1Requirement,
      minimumCet1,
      conservationBuffer + ccyBuffer + gSibSurcharge,
    );

    // ── Step 11: TLAC ──────────────────────────────────────────────────────
    const tlacAssessment = input.tlac && input.isGSib
      ? this.computeTlac(input.tlac, totalRwa, totalExposure)
      : null;

    // ── Assemble report ────────────────────────────────────────────────────
    const reportId = `BASEL-${Date.now()}-${String(++reportCounter).padStart(4, '0')}`;

    return {
      reportId,
      reportingDate: input.reportingDate,
      institutionName: input.institutionName,
      leiCode: input.leiCode,
      generatedAt: new Date().toISOString(),
      capitalComponents: {
        cet1Capital,
        additionalTier1: at1Capital,
        tier1Capital,
        tier2Capital: t2Capital,
        totalCapital,
      },
      rwaBreakdown: {
        creditRwa,
        marketRwa,
        operationalRwa,
        totalRwa,
        saRwa: saTotalRwa,
        outputFloorApplied,
        creditRwaByAssetClass: creditRows,
      },
      capitalRatios: {
        cet1Ratio,
        tier1Ratio,
        totalCapitalRatio,
        leverageRatio,
      },
      capitalRequirements: requirements,
      bufferPosition: {
        cet1Surplus: (cet1Ratio - totalCet1Requirement) * totalRwa,
        cet1BreachDistance: totalRwa * Math.max(0, totalCet1Requirement - cet1Ratio),
        tier1Surplus: (tier1Ratio - 0.06) * totalRwa,
        totalCapitalSurplus: (totalCapitalRatio - 0.08) * totalRwa,
        leverageSurplus: (leverageRatio - 0.03) * totalExposure,
        distributionRestrictions,
      },
      leverageDetails: {
        tier1Capital,
        totalExposure,
        leverageRatio,
        minimumRequired: 0.03,
        compliant: leverageCompliant,
      },
      tlacAssessment,
      complianceStatus: {
        cet1Compliant,
        tier1Compliant,
        totalCapitalCompliant,
        leverageCompliant,
        overallCompliant,
      },
      regulatoryNotes: notes,
    };
  }

  // ── Capital computation helpers ───────────────────────────────────────────

  private computeCet1(c: Cet1Components): number {
    const gross =
      c.commonStockAndSurplus +
      c.retainedEarnings +
      c.accumulatedOtherComprehensiveIncome;
    const deductions =
      c.goodwillAndIntangibles +
      c.deferredTaxAssets +
      c.significantInvestmentsInFinancialInstitutions +
      c.otherDeductions;
    return Math.max(0, gross - deductions);
  }

  private computeAt1(a: AdditionalTier1Components): number {
    const gross =
      a.perpetualNonCumulativePreferredStock +
      a.contingentConvertibleBonds +
      a.otherAt1Instruments;
    return Math.max(0, gross - a.at1Deductions);
  }

  private computeT2(t: Tier2Components): number {
    const gross =
      t.subordinatedDebt +
      t.allowanceForLoanLosses +
      t.otherT2Instruments;
    return Math.max(0, gross - t.t2Deductions);
  }

  // ── Credit RWA ────────────────────────────────────────────────────────────

  private computeCreditRwa(
    exposures: CreditRwaExposure[],
    applyFloor: boolean,
    notes: string[],
  ): { creditRwa: number; saRwa: number; creditRows: BaselCapitalReport['rwaBreakdown']['creditRwaByAssetClass'] } {
    let modelRwa = 0;
    let saRwa = 0;

    const rows = exposures.map((e) => {
      const saRw = SA_CR_RISK_WEIGHTS[e.assetClass] ?? 1.0;
      const exposureSaRwa = e.exposureAmount * saRw;
      const exposureModelRwa = e.irbaRwa !== undefined ? e.irbaRwa : (e.customRiskWeight !== undefined ? e.exposureAmount * e.customRiskWeight : exposureSaRwa);

      modelRwa += exposureModelRwa;
      saRwa += exposureSaRwa;

      const effectiveRw = e.irbaRwa !== undefined ? e.irbaRwa / e.exposureAmount :
                          e.customRiskWeight !== undefined ? e.customRiskWeight : saRw;

      return {
        assetClass: e.assetClass,
        description: e.description,
        exposure: e.exposureAmount,
        riskWeight: effectiveRw,
        rwa: exposureModelRwa,
      };
    });

    if (applyFloor && modelRwa < saRwa * 0.725) {
      const finalRwa = saRwa * 0.725;
      notes.push(`Credit RWA output floor: IRBA RWA (${modelRwa.toFixed(0)}) floored to 72.5% of SA-CR RWA (${finalRwa.toFixed(0)})`);
      return { creditRwa: finalRwa, saRwa, creditRows: rows };
    }

    return { creditRwa: modelRwa, saRwa, creditRows: rows };
  }

  // ── Market RWA ────────────────────────────────────────────────────────────

  private computeMarketRwa(m: MarketRwaInput, notes: string[]): number {
    // Internal Models Approach (IMA): RWA = 12.5 × (VaR capital charge)
    // Capital charge = max(VaR_t-1, mc * VaR_avg) + max(SVaR_t-1, ms * SVaR_avg) + IRC + CRM
    // Simplified: use provided VaR/SVaR directly as capital charge, scale to RWA
    if (m.frtbSa !== undefined) {
      notes.push(`Market RWA: using FRTB Standardised Approach (${m.frtbSa.toFixed(0)})`);
      return m.frtbSa;
    }

    const capitalCharge =
      m.tradingBookVaR99_10day * 3 +   // multiplier mc=3
      m.stressedVaR99_10day * 3 +      // multiplier ms=3
      m.incrementalRiskCharge +
      m.comprehensiveRiskMeasure;

    return capitalCharge * 12.5;
  }

  // ── Operational RWA ───────────────────────────────────────────────────────

  private computeOperationalRwa(o: OperationalRwaInput, notes: string[]): number {
    if (o.approach === 'BIA') {
      // Basic Indicator Approach: 15% × average gross income × 12.5
      const grossIncome = o.grossIncome3YrAvg ?? 0;
      notes.push(`Operational RWA: BIA approach (15% × gross income)`);
      return grossIncome * 0.15 * 12.5;
    }

    if (o.approach === 'TSA') {
      // Standardised Approach: β factors by business line (simplified: ~12%)
      const grossIncome = o.grossIncome3YrAvg ?? 0;
      notes.push(`Operational RWA: TSA approach (~12% × gross income)`);
      return grossIncome * 0.12 * 12.5;
    }

    // SMA (Basel IV Standardised Measurement Approach)
    // Operational RWA = BIC × ILM × 12.5
    const bic = o.businessIndicatorComponent ?? 0;
    const ilm = Math.min(5, Math.max(1, o.internalLossMultiplier ?? 1));
    notes.push(`Operational RWA: SMA approach (BIC=${bic.toFixed(0)}, ILM=${ilm.toFixed(2)})`);
    return bic * ilm * 12.5;
  }

  // ── Distribution restrictions ─────────────────────────────────────────────
  // CRD IV Article 141: restrictions apply when CET1 is in the combined buffer range

  private computeDistributionRestrictions(
    cet1Ratio: number,
    totalRequirement: number,
    minimumCet1: number,
    combinedBuffer: number,
  ): string | null {
    if (cet1Ratio < minimumCet1) {
      return 'FULL RESTRICTION — CET1 below minimum 4.5%. No distributions, bonuses, or AT1 coupon payments permitted.';
    }
    if (cet1Ratio >= totalRequirement) {
      return null;
    }
    // Within combined buffer: apply conservation bands
    const bufferUsed = cet1Ratio - minimumCet1;
    const bufferPct = bufferUsed / combinedBuffer;

    if (bufferPct < 0.25) {
      return `BAND 1 (0–25% of combined buffer): Max 0% payout ratio. CET1 buffer: ${(bufferUsed * 100).toFixed(2)}% of ${(combinedBuffer * 100).toFixed(2)}% required buffer.`;
    }
    if (bufferPct < 0.50) {
      return `BAND 2 (25–50% of combined buffer): Max 20% payout ratio. CET1 buffer: ${(bufferUsed * 100).toFixed(2)}%.`;
    }
    if (bufferPct < 0.75) {
      return `BAND 3 (50–75% of combined buffer): Max 40% payout ratio. CET1 buffer: ${(bufferUsed * 100).toFixed(2)}%.`;
    }
    return `BAND 4 (75–100% of combined buffer): Max 60% payout ratio. CET1 buffer: ${(bufferUsed * 100).toFixed(2)}%.`;
  }

  // ── TLAC assessment ───────────────────────────────────────────────────────

  private computeTlac(tlac: TlacInput, totalRwa: number, totalExposure: number): TlacAssessment {
    const tlacRwaRatio = totalRwa > 0 ? tlac.tlacInstruments / totalRwa : Infinity;
    const tlacLeverageRatio = totalExposure > 0 ? tlac.tlacInstruments / totalExposure : Infinity;
    const tlacRwaCompliant = tlacRwaRatio >= tlac.minimumTlacRwaRatio;
    const tlacLeverageCompliant = tlacLeverageRatio >= tlac.minimumTlacLevRatio;

    const rwaShortfall = Math.max(0, tlac.minimumTlacRwaRatio * totalRwa - tlac.tlacInstruments);
    const levShortfall = Math.max(0, tlac.minimumTlacLevRatio * totalExposure - tlac.tlacInstruments);
    const shortfall = Math.max(rwaShortfall, levShortfall);

    return {
      tlacInstruments: tlac.tlacInstruments,
      totalRwa,
      totalExposure,
      tlacRwaRatio,
      tlacLeverageRatio,
      minimumTlacRwa: tlac.minimumTlacRwaRatio,
      minimumTlacLeverage: tlac.minimumTlacLevRatio,
      tlacRwaCompliant,
      tlacLeverageCompliant,
      shortfall,
    };
  }

  // ── Regulatory rate sheet ─────────────────────────────────────────────────

  getRegulatoryRates() {
    return {
      cet1Minimum: '4.5% (Basel III Pillar 1)',
      capitalConservationBuffer: '2.5% (Basel III)',
      countercyclicalBuffer: '0–2.5% (jurisdiction-specific)',
      gSibSurcharge: '1%–3.5% (BCBS G-SIB framework)',
      tier1Minimum: '6%',
      totalCapitalMinimum: '8%',
      leverageRatioMinimum: '3% (Basel III); 3.5–4% proposed for G-SIBs',
      outputFloor: '72.5% of SA RWA (Basel IV, phased in 2025–2028)',
      tlacGsib: '18% of RWA or 6.75% of leverage exposure (from 2022)',
      sacrRiskWeights: SA_CR_RISK_WEIGHTS,
    };
  }
}
