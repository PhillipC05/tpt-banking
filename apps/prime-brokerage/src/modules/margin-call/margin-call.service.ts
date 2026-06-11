import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type MarginType = 'INITIAL_MARGIN' | 'VARIATION_MARGIN' | 'INDEPENDENT_AMOUNT';

export type MarginCallStatus =
  | 'OPEN'
  | 'PARTIALLY_CURED'
  | 'CURED'
  | 'DISPUTED'
  | 'DEFAULTED'
  | 'CANCELLED';

export type IMModel = 'SIMM' | 'SPAN' | 'PORTFOLIO_VaR' | 'FIXED_SCHEDULE';

export type AgreementType = 'CSA' | 'GMRA' | 'GMSLA' | 'MRA' | 'ISDA_2002';

export type DisputeResolutionMethod = 'RECALCULATION' | 'INDEPENDENT_PRICE' | 'SENIOR_OFFICER';

// ── SIMM Risk Classes (simplified) ───────────────────────────────────────────
// ISDA SIMM uses sensitivity-based approach; we implement a simplified factor model

export interface SIMMSensitivity {
  riskClass: 'IR' | 'FX' | 'CR' | 'EQ' | 'CO' | 'CNTR';
  bucket: string;    // e.g. 'USD' for IR, '1' for EQ bucket
  sensitivityType: 'Delta' | 'Vega' | 'Curvature';
  value: string;     // USD sensitivity (DV01, Vega notional, etc.)
  maturityBucket?: string;
}

// SIMM risk weights (basis — simplified from ISDA SIMM 2.6)
const SIMM_RISK_WEIGHTS: Record<string, number> = {
  IR:   77,    // bps
  FX:   7.4,   // %
  CR:   96,    // bps
  EQ:   20,    // %
  CO:   18,    // %
  CNTR: 15,    // %
};

// SIMM correlation matrix (intra-class, simplified)
const SIMM_CORRELATIONS: Record<string, number> = {
  'IR-IR':   0.14,
  'FX-FX':   0.50,
  'CR-CR':   0.42,
  'EQ-EQ':   0.27,
  'CO-CO':   0.28,
  'IR-FX':   0.27,
  'IR-CR':   0.20,
  'IR-EQ':   0.18,
  'IR-CO':   0.32,
  'FX-CR':   0.21,
  'FX-EQ':   0.24,
  'FX-CO':   0.25,
  'CR-EQ':   0.15,
  'CR-CO':   0.20,
  'EQ-CO':   0.22,
};

// ── Core interfaces ───────────────────────────────────────────────────────────

export interface MarginAgreement {
  agreementId: string;
  counterpartyId: string;
  agreementType: AgreementType;
  currency: string;
  imModel: IMModel;
  minimumTransferAmount: string;    // MTA — calls below this are not issued
  threshold: string;                // unsecured credit threshold
  independentAmount: string;        // fixed IA (if any)
  rounding: string;                 // round to nearest N
  callFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  settlementLag: number;            // T+N settlement
  eligibleSchedule: string;         // references EligibilitySchedule from collateral module
  disputeResolutionDays: number;    // business days to resolve a dispute
  closeOutNetting: boolean;
  status: 'ACTIVE' | 'TERMINATED' | 'SUSPENDED';
  effectiveDate: string;
  expiryDate: string | null;
}

export interface MarginExposure {
  exposureId: string;
  agreementId: string;
  counterpartyId: string;
  valuationDate: string;
  grossMTM: string;              // total mark-to-market PnL of all trades under agreement
  netMTM: string;                // after netting (same as gross if close-out netting)
  initialMarginRequired: string; // IM calculated by model
  variationMarginRequired: string; // VM = netMTM (or max(netMTM - threshold, 0))
  totalMarginRequired: string;
  collateralHeld: string;        // current eligible collateral value held
  marginCallAmount: string;      // totalRequired - collateralHeld (positive = call, negative = return)
  imModel: IMModel;
  simmSensitivities?: SIMMSensitivity[];
}

export interface MarginCall {
  callId: string;
  agreementId: string;
  counterpartyId: string;
  callType: MarginType;
  callDate: string;
  dueDate: string;               // callDate + settlementLag
  callAmount: string;            // amount called
  currency: string;
  status: MarginCallStatus;
  curiedAmount: string;          // amount delivered so far
  outstandingAmount: string;     // callAmount - curiedAmount
  deliveries: MarginDelivery[];
  disputedAmount: string | null;
  disputeReason: string | null;
  disputeOpenedAt: string | null;
  disputeResolutionMethod: DisputeResolutionMethod | null;
  defaultNoticeSentAt: string | null;
  notes: string;
}

export interface MarginDelivery {
  deliveryId: string;
  callId: string;
  deliveredAt: string;
  assetType: string;
  amount: string;
  currency: string;
  reference: string;
}

export interface MarginCallSummary {
  agreementId: string;
  counterpartyId: string;
  openCalls: number;
  totalOutstanding: string;
  overdueAmount: string;         // past due date
  totalDisputedAmount: string;
  defaultedAmount: string;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const agreementStore = new Map<string, MarginAgreement>();
const exposureStore  = new Map<string, MarginExposure>();
const callStore      = new Map<string, MarginCall>();

// ── SIMM Calculation ──────────────────────────────────────────────────────────

function calculateSIMM(sensitivities: SIMMSensitivity[]): Decimal {
  // Aggregate by risk class
  const byClass: Record<string, Decimal> = {};
  for (const s of sensitivities) {
    const weight = SIMM_RISK_WEIGHTS[s.riskClass] ?? 10;
    const weighted = new Decimal(s.value).abs().times(weight).dividedBy(10000);
    byClass[s.riskClass] = (byClass[s.riskClass] ?? new Decimal(0)).plus(weighted);
  }

  // Aggregate across risk classes using SIMM correlation matrix
  const classes = Object.keys(byClass);
  let totalIM = new Decimal(0);

  // IM = sqrt(Σ_i Σ_j ρ_ij * IM_i * IM_j)
  for (const ci of classes) {
    for (const cj of classes) {
      const rho = ci === cj
        ? new Decimal(1)
        : new Decimal(SIMM_CORRELATIONS[`${ci}-${cj}`] ?? SIMM_CORRELATIONS[`${cj}-${ci}`] ?? 0);
      totalIM = totalIM.plus(
        rho.times(byClass[ci]!).times(byClass[cj]!),
      );
    }
  }

  return totalIM.isNegative() ? new Decimal(0) : totalIM.sqrt();
}

function roundToNearest(value: Decimal, rounding: string): Decimal {
  const r = new Decimal(rounding);
  if (r.isZero()) return value;
  return value.dividedBy(r).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(r);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class MarginCallService {
  private readonly logger = new Logger(MarginCallService.name);

  // ── Agreements ────────────────────────────────────────────────────────────

  createAgreement(params: Omit<MarginAgreement, 'agreementId' | 'status'>): MarginAgreement {
    const agreement: MarginAgreement = {
      agreementId: uuidv4(),
      status:      'ACTIVE',
      ...params,
    };
    agreementStore.set(agreement.agreementId, agreement);
    this.logger.log(`Margin agreement ${agreement.agreementId} created for counterparty ${agreement.counterpartyId} (${agreement.agreementType})`);
    return agreement;
  }

  getAgreement(agreementId: string): MarginAgreement {
    const a = agreementStore.get(agreementId);
    if (!a) throw new NotFoundException(`Margin agreement ${agreementId} not found`);
    return a;
  }

  listAgreements(counterpartyId?: string): MarginAgreement[] {
    const all = [...agreementStore.values()];
    return counterpartyId ? all.filter((a) => a.counterpartyId === counterpartyId) : all;
  }

  // ── Exposure calculation ───────────────────────────────────────────────────

  calculateExposure(params: {
    agreementId: string;
    grossMTM: string;
    collateralHeld: string;
    simmSensitivities?: SIMMSensitivity[];
    spanMarginRequired?: string;    // pre-calculated SPAN margin (for futures)
    fixedIMSchedule?: string;       // fixed IM amount (for fixed-schedule model)
  }): MarginExposure {
    const agreement = this.getAgreement(params.agreementId);

    const grossMTM = new Decimal(params.grossMTM);
    const netMTM   = agreement.closeOutNetting ? grossMTM : grossMTM;  // simplified: netting = gross for single counterparty

    // Variation Margin = max(netMTM - threshold, 0) or max(-netMTM - threshold, 0) depending on direction
    const threshold = new Decimal(agreement.threshold);
    let vmRequired: Decimal;
    if (netMTM.gt(0)) {
      // We are owed money — counterparty posts VM to us
      vmRequired = Decimal.max(netMTM.minus(threshold), new Decimal(0));
    } else {
      // We owe money — we post VM to counterparty
      vmRequired = Decimal.max(netMTM.abs().minus(threshold), new Decimal(0)).negated();
    }

    // Initial Margin
    let imRequired = new Decimal(0);
    switch (agreement.imModel) {
      case 'SIMM':
        if (params.simmSensitivities && params.simmSensitivities.length > 0) {
          imRequired = calculateSIMM(params.simmSensitivities);
        }
        break;
      case 'SPAN':
        imRequired = new Decimal(params.spanMarginRequired ?? '0');
        break;
      case 'FIXED_SCHEDULE':
        imRequired = new Decimal(params.fixedIMSchedule ?? agreement.independentAmount);
        break;
      case 'PORTFOLIO_VaR':
        // Simplified: 99% 10-day VaR ≈ 2.33 × daily vol × √10 × notional
        // Use 3% of gross exposure as a proxy
        imRequired = grossMTM.abs().times('0.03');
        break;
    }

    imRequired = imRequired.plus(new Decimal(agreement.independentAmount));

    const totalRequired    = vmRequired.abs().plus(imRequired);
    const collateralHeld   = new Decimal(params.collateralHeld);
    const rawCallAmount    = totalRequired.minus(collateralHeld);

    // Apply MTA and rounding
    const mta = new Decimal(agreement.minimumTransferAmount);
    let callAmount = rawCallAmount.abs().gte(mta)
      ? rawCallAmount
      : new Decimal(0);
    callAmount = roundToNearest(callAmount, agreement.rounding);

    const exposure: MarginExposure = {
      exposureId:              uuidv4(),
      agreementId:             params.agreementId,
      counterpartyId:          agreement.counterpartyId,
      valuationDate:           new Date().toISOString().split('T')[0]!,
      grossMTM:                grossMTM.toFixed(2),
      netMTM:                  netMTM.toFixed(2),
      initialMarginRequired:   imRequired.toFixed(2),
      variationMarginRequired: vmRequired.toFixed(2),
      totalMarginRequired:     totalRequired.toFixed(2),
      collateralHeld:          collateralHeld.toFixed(2),
      marginCallAmount:        callAmount.toFixed(2),
      imModel:                 agreement.imModel,
      simmSensitivities:       params.simmSensitivities,
    };
    exposureStore.set(exposure.exposureId, exposure);
    this.logger.log(
      `Exposure ${exposure.exposureId}: VM=${vmRequired.toFixed(2)} IM=${imRequired.toFixed(2)} ` +
      `held=${collateralHeld.toFixed(2)} call=${callAmount.toFixed(2)}`,
    );
    return exposure;
  }

  getExposure(exposureId: string): MarginExposure {
    const e = exposureStore.get(exposureId);
    if (!e) throw new NotFoundException(`Exposure ${exposureId} not found`);
    return e;
  }

  listExposures(agreementId?: string): MarginExposure[] {
    const all = [...exposureStore.values()];
    return agreementId ? all.filter((e) => e.agreementId === agreementId) : all;
  }

  // ── Margin call issuance ──────────────────────────────────────────────────

  issueMarginCall(params: {
    agreementId: string;
    callType: MarginType;
    callAmount: string;
    notes?: string;
  }): MarginCall {
    const agreement = this.getAgreement(params.agreementId);
    if (agreement.status !== 'ACTIVE') {
      throw new BadRequestException(`Agreement ${params.agreementId} is not active (status: ${agreement.status})`);
    }

    const amount = new Decimal(params.callAmount);
    if (amount.abs().lt(new Decimal(agreement.minimumTransferAmount))) {
      throw new BadRequestException(
        `Call amount ${amount.toFixed(2)} is below MTA (${agreement.minimumTransferAmount})`,
      );
    }

    const callDate = new Date();
    const dueDate  = new Date(callDate);
    dueDate.setDate(dueDate.getDate() + agreement.settlementLag);

    const call: MarginCall = {
      callId:                   uuidv4(),
      agreementId:              params.agreementId,
      counterpartyId:           agreement.counterpartyId,
      callType:                 params.callType,
      callDate:                 callDate.toISOString().split('T')[0]!,
      dueDate:                  dueDate.toISOString().split('T')[0]!,
      callAmount:               amount.toFixed(2),
      currency:                 agreement.currency,
      status:                   'OPEN',
      curiedAmount:             '0.00',
      outstandingAmount:        amount.toFixed(2),
      deliveries:               [],
      disputedAmount:           null,
      disputeReason:            null,
      disputeOpenedAt:          null,
      disputeResolutionMethod:  null,
      defaultNoticeSentAt:      null,
      notes:                    params.notes ?? '',
    };

    callStore.set(call.callId, call);
    this.logger.log(`Margin call ${call.callId} issued: ${amount.toFixed(2)} ${agreement.currency} (${params.callType}) due ${call.dueDate}`);
    return call;
  }

  getCall(callId: string): MarginCall {
    const c = callStore.get(callId);
    if (!c) throw new NotFoundException(`Margin call ${callId} not found`);
    return c;
  }

  listCalls(agreementId?: string, status?: MarginCallStatus): MarginCall[] {
    let all = [...callStore.values()];
    if (agreementId) all = all.filter((c) => c.agreementId === agreementId);
    if (status)      all = all.filter((c) => c.status === status);
    return all;
  }

  // ── Delivery (cure) ───────────────────────────────────────────────────────

  recordDelivery(callId: string, params: {
    assetType: string;
    amount: string;
    currency: string;
    reference: string;
  }): MarginCall {
    const call = this.getCall(callId);
    if (call.status === 'CURED' || call.status === 'DEFAULTED' || call.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot deliver on call ${callId} in status ${call.status}`);
    }

    const amount = new Decimal(params.amount);
    if (amount.lte(0)) throw new BadRequestException('Delivery amount must be positive');

    const delivery: MarginDelivery = {
      deliveryId:  uuidv4(),
      callId,
      deliveredAt: new Date().toISOString(),
      assetType:   params.assetType,
      amount:      amount.toFixed(2),
      currency:    params.currency,
      reference:   params.reference,
    };
    call.deliveries.push(delivery);

    const totalCured = call.deliveries.reduce(
      (sum, d) => sum.plus(new Decimal(d.amount)), new Decimal(0),
    );
    call.curiedAmount      = totalCured.toFixed(2);
    const outstanding      = new Decimal(call.callAmount).minus(totalCured);
    call.outstandingAmount = outstanding.lte(0) ? '0.00' : outstanding.toFixed(2);

    if (outstanding.lte(0)) {
      call.status = 'CURED';
    } else {
      call.status = 'PARTIALLY_CURED';
    }

    callStore.set(callId, call);
    this.logger.log(`Delivery on call ${callId}: ${amount.toFixed(2)} ${params.currency}. Outstanding: ${call.outstandingAmount}`);
    return call;
  }

  // ── Dispute workflow ──────────────────────────────────────────────────────

  openDispute(callId: string, params: {
    disputedAmount: string;
    disputeReason: string;
    resolutionMethod: DisputeResolutionMethod;
  }): MarginCall {
    const call = this.getCall(callId);
    if (call.status === 'CURED' || call.status === 'DEFAULTED') {
      throw new BadRequestException(`Cannot dispute call ${callId} in status ${call.status}`);
    }

    call.status                    = 'DISPUTED';
    call.disputedAmount            = new Decimal(params.disputedAmount).toFixed(2);
    call.disputeReason             = params.disputeReason;
    call.disputeOpenedAt           = new Date().toISOString();
    call.disputeResolutionMethod   = params.resolutionMethod;
    callStore.set(callId, call);

    this.logger.log(`Dispute opened on call ${callId}: ${params.disputedAmount} — ${params.disputeReason}`);
    return call;
  }

  resolveDispute(callId: string, params: {
    agreedAmount: string;
    notes?: string;
  }): MarginCall {
    const call = this.getCall(callId);
    if (call.status !== 'DISPUTED') {
      throw new BadRequestException(`Call ${callId} is not in DISPUTED status`);
    }

    // Re-set call amount to agreed amount
    const agreed = new Decimal(params.agreedAmount);
    call.callAmount       = agreed.toFixed(2);
    call.disputedAmount   = null;
    call.disputeReason    = null;
    const cured           = new Decimal(call.curiedAmount);
    const outstanding     = agreed.minus(cured);
    call.outstandingAmount = outstanding.lte(0) ? '0.00' : outstanding.toFixed(2);
    call.status            = outstanding.lte(0) ? 'CURED' : 'OPEN';
    if (params.notes) call.notes += ` [Resolved: ${params.notes}]`;
    callStore.set(callId, call);
    return call;
  }

  // ── Default notice ────────────────────────────────────────────────────────

  sendDefaultNotice(callId: string): MarginCall {
    const call = this.getCall(callId);
    const today = new Date().toISOString().split('T')[0]!;

    if (call.status === 'CURED') {
      throw new BadRequestException(`Call ${callId} has already been cured`);
    }
    if (today <= call.dueDate) {
      throw new BadRequestException(
        `Cannot send default notice: call ${callId} is not yet past due (due ${call.dueDate})`,
      );
    }

    call.status                = 'DEFAULTED';
    call.defaultNoticeSentAt   = new Date().toISOString();
    callStore.set(callId, call);
    this.logger.warn(`DEFAULT NOTICE sent on call ${callId}: ${call.outstandingAmount} ${call.currency} overdue`);
    return call;
  }

  cancelCall(callId: string, reason: string): MarginCall {
    const call = this.getCall(callId);
    if (call.status === 'CURED' || call.status === 'DEFAULTED') {
      throw new BadRequestException(`Cannot cancel call ${callId} in status ${call.status}`);
    }
    call.status = 'CANCELLED';
    call.notes  += ` [Cancelled: ${reason}]`;
    callStore.set(callId, call);
    return call;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  getCallSummary(agreementId?: string): MarginCallSummary[] {
    const agreements = agreementId
      ? [this.getAgreement(agreementId)]
      : [...agreementStore.values()];

    const today = new Date().toISOString().split('T')[0]!;

    return agreements.map((agr) => {
      const calls = this.listCalls(agr.agreementId);
      const open  = calls.filter((c) => c.status === 'OPEN' || c.status === 'PARTIALLY_CURED' || c.status === 'DISPUTED');

      const totalOutstanding = open.reduce(
        (sum, c) => sum.plus(new Decimal(c.outstandingAmount)), new Decimal(0),
      );
      const overdueAmount = open
        .filter((c) => c.dueDate < today)
        .reduce((sum, c) => sum.plus(new Decimal(c.outstandingAmount)), new Decimal(0));
      const disputedAmount = calls
        .filter((c) => c.status === 'DISPUTED')
        .reduce((sum, c) => sum.plus(new Decimal(c.disputedAmount ?? '0')), new Decimal(0));
      const defaultedAmount = calls
        .filter((c) => c.status === 'DEFAULTED')
        .reduce((sum, c) => sum.plus(new Decimal(c.outstandingAmount)), new Decimal(0));

      return {
        agreementId:          agr.agreementId,
        counterpartyId:       agr.counterpartyId,
        openCalls:            open.length,
        totalOutstanding:     totalOutstanding.toFixed(2),
        overdueAmount:        overdueAmount.toFixed(2),
        totalDisputedAmount:  disputedAmount.toFixed(2),
        defaultedAmount:      defaultedAmount.toFixed(2),
      };
    });
  }
}
