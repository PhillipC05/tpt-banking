import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type PBAccountType =
  | 'LONG_ONLY'          // traditional long positions, no leverage
  | 'HEDGE_FUND'         // full PB with long/short, leverage, synthetic exposure
  | 'FAMILY_OFFICE'      // managed accounts, typically long-biased
  | 'PENSION_FUND'       // regulatory constraints on leverage and shorts
  | 'CORPORATE';         // corporate treasury / special situations

export type FinancingType =
  | 'MARGIN_LOAN'        // debit balance financing
  | 'REPO'               // repurchase agreement financing
  | 'TOTAL_RETURN_SWAP'  // TRS / synthetic financing
  | 'CFD'                // contract for difference
  | 'SECURITIES_LEND';   // securities borrowed to facilitate short sales

export type SyntheticType = 'LONG_TRS' | 'SHORT_TRS' | 'LONG_CFD' | 'SHORT_CFD';

export type PBReportType =
  | 'DAILY_BALANCE'
  | 'PORTFOLIO_RISK'
  | 'FINANCING_SUMMARY'
  | 'MARGIN_USAGE'
  | 'SYNTHETIC_EXPOSURE'
  | 'REHYPOTHECATION';

// ── Core Interfaces ───────────────────────────────────────────────────────────

export interface PBAccount {
  pbAccountId: string;
  clientId: string;              // counterparty ID from compliance/KYC
  clientName: string;
  accountType: PBAccountType;
  currency: string;
  netAssetValue: string;         // total NAV of the fund/account
  longMarketValue: string;       // total long positions MV
  shortMarketValue: string;      // total short positions MV (absolute)
  netMarketValue: string;        // longs - |shorts|
  grossMarketValue: string;      // longs + |shorts|
  debitBalance: string;          // margin loan outstanding (cash borrowed)
  creditBalance: string;         // excess cash / free credit
  equity: string;                // NAV - debitBalance
  grossLeverage: string;         // grossMV / equity
  netLeverage: string;           // netMV / equity
  maximumLeverage: string;       // agreed maximum leverage multiple
  haircut: string;               // portfolio-level haircut applied to collateral
  excessMargin: string;          // excess over initial margin requirement
  maintenanceMarginRequired: string;
  initialMarginRequired: string;
  marginCallLevel: string;       // NAV at which margin call is triggered
  rehypothecationEnabled: boolean;
  rehypothecationLimit: string;  // % of client assets that can be rehypothecated
  custodian: string;
  primebroker: string;
  status: 'ACTIVE' | 'RESTRICTED' | 'WIND_DOWN' | 'CLOSED';
  openedAt: string;
}

export interface PBPosition {
  positionId: string;
  pbAccountId: string;
  isin: string;
  description: string;
  side: 'LONG' | 'SHORT';
  quantity: string;
  averageCost: string;
  currentPrice: string;
  marketValue: string;
  unrealizedPnL: string;
  unrealizedPnLPct: string;
  dayPnL: string;
  haircut: string;               // position-level haircut
  eligibleAsCollateral: boolean;
  rehypothecated: boolean;       // whether this position has been rehypothecated
  financingType: FinancingType | null;
  financingRate: string | null;  // cost of carry (annual %)
  financingCostAccrued: string;  // accrued financing cost to date
}

export interface SyntheticPosition {
  syntheticId: string;
  pbAccountId: string;
  syntheticType: SyntheticType;
  underlyingISIN: string;
  underlyingDescription: string;
  notionalValue: string;
  currentPrice: string;
  entryPrice: string;
  unrealizedPnL: string;
  totalReturnRate: string;       // TRS funding rate (e.g. SOFR + spread)
  accrualBasis: 'ACT_360' | 'ACT_365';
  accruedFinancingCost: string;
  counterpartyId: string;        // swap dealer / CFD provider
  terminationDate: string | null;
  openedAt: string;
  status: 'ACTIVE' | 'TERMINATED';
}

export interface FinancingFacility {
  facilityId: string;
  pbAccountId: string;
  financingType: FinancingType;
  currency: string;
  facilityLimit: string;         // maximum borrowing
  drawn: string;                 // current drawn amount
  available: string;             // facilityLimit - drawn
  rate: string;                  // financing rate (annual %)
  rateReference: string;         // e.g. 'SOFR + 45bps'
  collateralISINs: string[];     // pledged collateral ISINs
  maturityDate: string | null;   // null = revolving
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
}

export interface RehypothecationRecord {
  rehypId: string;
  pbAccountId: string;
  sourcePositionId: string;      // client's position being rehypothecated
  isin: string;
  quantity: string;
  marketValue: string;
  usedFor: string;               // e.g. 'Repo to fund client margin loan'
  counterpartyId: string;
  rate: string;                  // rate earned on rehypothecated assets
  startDate: string;
  maturityDate: string | null;
  status: 'ACTIVE' | 'RETURNED';
}

export interface PBDailyReport {
  reportId: string;
  pbAccountId: string;
  reportDate: string;
  reportType: PBReportType;
  nav: string;
  longMV: string;
  shortMV: string;
  netMV: string;
  grossMV: string;
  grossLeverage: string;
  netLeverage: string;
  debitBalance: string;
  creditBalance: string;
  dayPnL: string;
  mtdPnL: string;
  ytdPnL: string;
  imRequired: string;
  mmRequired: string;
  excessMargin: string;
  topPositions: Array<{ isin: string; description: string; side: string; marketValue: string; unrealizedPnL: string }>;
  syntheticExposure: string;     // total notional of synthetic positions
  totalFinancingCost: string;    // total accrued financing across all positions
  rehypothecatedValue: string;   // total market value of rehypothecated assets
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const pbAccountStore     = new Map<string, PBAccount>();
const positionStore      = new Map<string, PBPosition>();
const syntheticStore     = new Map<string, SyntheticPosition>();
const facilityStore      = new Map<string, FinancingFacility>();
const rehypStore         = new Map<string, RehypothecationRecord>();
const reportStore        = new Map<string, PBDailyReport>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const POSITION_HAIRCUTS: Record<string, number> = {
  'GOVERNMENT_BOND': 2,
  'EQUITY':          15,
  'CORP_BOND':       8,
  'CASH':            0,
};

function positionHaircut(description: string): number {
  const d = description.toUpperCase();
  if (d.includes('TREASURY') || d.includes('GILT') || d.includes('BUND')) return POSITION_HAIRCUTS['GOVERNMENT_BOND']!;
  if (d.includes('BOND') || d.includes('NOTE')) return POSITION_HAIRCUTS['CORP_BOND']!;
  return POSITION_HAIRCUTS['EQUITY']!;
}

function recalculateAccountMetrics(account: PBAccount, positions: PBPosition[]): void {
  let longMV  = new Decimal(0);
  let shortMV = new Decimal(0);
  let debit   = new Decimal(account.debitBalance);

  for (const pos of positions) {
    if (pos.pbAccountId !== account.pbAccountId) continue;
    const mv = new Decimal(pos.marketValue).abs();
    if (pos.side === 'LONG')  longMV  = longMV.plus(mv);
    if (pos.side === 'SHORT') shortMV = shortMV.plus(mv);
  }

  const grossMV = longMV.plus(shortMV);
  const netMV   = longMV.minus(shortMV);
  const nav     = new Decimal(account.netAssetValue);
  const equity  = nav.minus(debit);

  const grossLeverage = equity.isZero() ? new Decimal(0) : grossMV.dividedBy(equity);
  const netLeverage   = equity.isZero() ? new Decimal(0) : netMV.abs().dividedBy(equity);

  // Initial margin = 25% of gross MV (simplified Reg T proxy); Maintenance = 20%
  const imRequired = grossMV.times('0.25');
  const mmRequired = grossMV.times('0.20');
  const excessMargin = equity.minus(imRequired);

  // Margin call level: when equity = mmRequired → NAV = mmRequired + debit
  const marginCallLevel = mmRequired.plus(debit);

  account.longMarketValue           = longMV.toFixed(2);
  account.shortMarketValue          = shortMV.toFixed(2);
  account.netMarketValue            = netMV.toFixed(2);
  account.grossMarketValue          = grossMV.toFixed(2);
  account.equity                    = equity.toFixed(2);
  account.grossLeverage             = grossLeverage.toFixed(4);
  account.netLeverage               = netLeverage.toFixed(4);
  account.initialMarginRequired     = imRequired.toFixed(2);
  account.maintenanceMarginRequired = mmRequired.toFixed(2);
  account.excessMargin              = excessMargin.toFixed(2);
  account.marginCallLevel           = marginCallLevel.toFixed(2);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PrimeBrokerageService {
  private readonly logger = new Logger(PrimeBrokerageService.name);

  // ── PB Account management ─────────────────────────────────────────────────

  openPBAccount(params: {
    clientId: string;
    clientName: string;
    accountType: PBAccountType;
    currency: string;
    netAssetValue: string;
    maximumLeverage: string;
    rehypothecationEnabled?: boolean;
    rehypothecationLimit?: string;
    custodian: string;
    primebroker: string;
  }): PBAccount {
    const nav = new Decimal(params.netAssetValue);

    const account: PBAccount = {
      pbAccountId:               uuidv4(),
      clientId:                  params.clientId,
      clientName:                params.clientName,
      accountType:               params.accountType,
      currency:                  params.currency,
      netAssetValue:             nav.toFixed(2),
      longMarketValue:           '0.00',
      shortMarketValue:          '0.00',
      netMarketValue:            '0.00',
      grossMarketValue:          '0.00',
      debitBalance:              '0.00',
      creditBalance:             nav.toFixed(2),
      equity:                    nav.toFixed(2),
      grossLeverage:             '0.0000',
      netLeverage:               '0.0000',
      maximumLeverage:           new Decimal(params.maximumLeverage).toFixed(2),
      haircut:                   '0.00',
      excessMargin:              nav.toFixed(2),
      maintenanceMarginRequired: '0.00',
      initialMarginRequired:     '0.00',
      marginCallLevel:           '0.00',
      rehypothecationEnabled:    params.rehypothecationEnabled ?? false,
      rehypothecationLimit:      params.rehypothecationLimit ?? '0',
      custodian:                 params.custodian,
      primebroker:               params.primebroker,
      status:                    'ACTIVE',
      openedAt:                  new Date().toISOString(),
    };

    pbAccountStore.set(account.pbAccountId, account);
    this.logger.log(`PB account ${account.pbAccountId} opened for ${account.clientName} (${account.accountType}, NAV ${nav.toFixed(0)} ${params.currency})`);
    return account;
  }

  getPBAccount(pbAccountId: string): PBAccount {
    const a = pbAccountStore.get(pbAccountId);
    if (!a) throw new NotFoundException(`PB account ${pbAccountId} not found`);
    return a;
  }

  listPBAccounts(accountType?: PBAccountType, status?: PBAccount['status']): PBAccount[] {
    let all = [...pbAccountStore.values()];
    if (accountType) all = all.filter((a) => a.accountType === accountType);
    if (status)      all = all.filter((a) => a.status === status);
    return all;
  }

  updateNAV(pbAccountId: string, newNAV: string): PBAccount {
    const account = this.getPBAccount(pbAccountId);
    account.netAssetValue = new Decimal(newNAV).toFixed(2);
    const positions = this.listPositions(pbAccountId);
    recalculateAccountMetrics(account, positions);
    pbAccountStore.set(pbAccountId, account);
    return account;
  }

  // ── Positions ─────────────────────────────────────────────────────────────

  addPosition(pbAccountId: string, params: {
    isin: string;
    description: string;
    side: 'LONG' | 'SHORT';
    quantity: string;
    averageCost: string;
    currentPrice: string;
    financingType?: FinancingType;
    financingRate?: string;
  }): PBPosition {
    const account = this.getPBAccount(pbAccountId);
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException(`PB account ${pbAccountId} is not active`);
    }

    const qty         = new Decimal(params.quantity);
    const price       = new Decimal(params.currentPrice);
    const cost        = new Decimal(params.averageCost);
    const mv          = qty.times(price);
    const costBasis   = qty.times(cost);
    const ugl         = mv.minus(costBasis);
    const uglPct      = costBasis.isZero() ? new Decimal(0) : ugl.dividedBy(costBasis).times(100);
    const hc          = positionHaircut(params.description);

    const position: PBPosition = {
      positionId:          uuidv4(),
      pbAccountId,
      isin:                params.isin,
      description:         params.description,
      side:                params.side,
      quantity:            qty.toFixed(0),
      averageCost:         cost.toFixed(6),
      currentPrice:        price.toFixed(6),
      marketValue:         params.side === 'SHORT' ? mv.negated().toFixed(2) : mv.toFixed(2),
      unrealizedPnL:       params.side === 'SHORT' ? ugl.negated().toFixed(2) : ugl.toFixed(2),
      unrealizedPnLPct:    uglPct.toFixed(2),
      dayPnL:              '0.00',
      haircut:             `${hc}`,
      eligibleAsCollateral: params.side === 'LONG',
      rehypothecated:      false,
      financingType:       params.financingType ?? null,
      financingRate:       params.financingRate ?? null,
      financingCostAccrued: '0.00',
    };

    positionStore.set(position.positionId, position);
    recalculateAccountMetrics(account, this.listPositions(pbAccountId));
    pbAccountStore.set(pbAccountId, account);

    this.logger.log(`Position ${position.positionId}: ${params.side} ${qty.toFixed(0)} ${params.isin} @ ${price.toFixed(2)} MV=${mv.toFixed(0)}`);
    return position;
  }

  updatePositionPrice(positionId: string, newPrice: string, dayPnL?: string): PBPosition {
    const pos = positionStore.get(positionId);
    if (!pos) throw new NotFoundException(`Position ${positionId} not found`);

    const qty      = new Decimal(pos.quantity);
    const price    = new Decimal(newPrice);
    const cost     = new Decimal(pos.averageCost);
    const mv       = qty.times(price);
    const ugl      = mv.minus(qty.times(cost));

    pos.currentPrice      = price.toFixed(6);
    pos.marketValue       = pos.side === 'SHORT' ? mv.negated().toFixed(2) : mv.toFixed(2);
    pos.unrealizedPnL     = pos.side === 'SHORT' ? ugl.negated().toFixed(2) : ugl.toFixed(2);
    pos.unrealizedPnLPct  = qty.times(cost).isZero()
      ? '0.00'
      : ugl.dividedBy(qty.times(cost)).times(100).toFixed(2);
    pos.dayPnL            = dayPnL ? new Decimal(dayPnL).toFixed(2) : pos.dayPnL;
    positionStore.set(positionId, pos);

    const account = pbAccountStore.get(pos.pbAccountId);
    if (account) {
      recalculateAccountMetrics(account, this.listPositions(pos.pbAccountId));
      pbAccountStore.set(pos.pbAccountId, account);
    }

    return pos;
  }

  listPositions(pbAccountId: string): PBPosition[] {
    return [...positionStore.values()].filter((p) => p.pbAccountId === pbAccountId);
  }

  // ── Synthetic exposure ────────────────────────────────────────────────────

  addSyntheticPosition(pbAccountId: string, params: {
    syntheticType: SyntheticType;
    underlyingISIN: string;
    underlyingDescription: string;
    notionalValue: string;
    currentPrice: string;
    entryPrice: string;
    totalReturnRate: string;
    counterpartyId: string;
    terminationDate?: string;
    accrualBasis?: 'ACT_360' | 'ACT_365';
  }): SyntheticPosition {
    this.getPBAccount(pbAccountId);

    const entry   = new Decimal(params.entryPrice);
    const current = new Decimal(params.currentPrice);
    const notional = new Decimal(params.notionalValue);

    const isLong = params.syntheticType === 'LONG_TRS' || params.syntheticType === 'LONG_CFD';
    const pnl    = isLong
      ? current.minus(entry).dividedBy(entry).times(notional)
      : entry.minus(current).dividedBy(entry).times(notional);

    const syn: SyntheticPosition = {
      syntheticId:              uuidv4(),
      pbAccountId,
      syntheticType:            params.syntheticType,
      underlyingISIN:           params.underlyingISIN,
      underlyingDescription:    params.underlyingDescription,
      notionalValue:            notional.toFixed(2),
      currentPrice:             current.toFixed(6),
      entryPrice:               entry.toFixed(6),
      unrealizedPnL:            pnl.toFixed(2),
      totalReturnRate:          params.totalReturnRate,
      accrualBasis:             params.accrualBasis ?? 'ACT_360',
      accruedFinancingCost:     '0.00',
      counterpartyId:           params.counterpartyId,
      terminationDate:          params.terminationDate ?? null,
      openedAt:                 new Date().toISOString(),
      status:                   'ACTIVE',
    };

    syntheticStore.set(syn.syntheticId, syn);
    this.logger.log(`Synthetic ${syn.syntheticId} (${params.syntheticType}): notional ${notional.toFixed(0)} on ${params.underlyingISIN}`);
    return syn;
  }

  terminateSynthetic(syntheticId: string): SyntheticPosition {
    const syn = syntheticStore.get(syntheticId);
    if (!syn) throw new NotFoundException(`Synthetic position ${syntheticId} not found`);
    if (syn.status === 'TERMINATED') throw new BadRequestException('Already terminated');
    syn.status = 'TERMINATED';
    syntheticStore.set(syntheticId, syn);
    return syn;
  }

  listSynthetics(pbAccountId: string): SyntheticPosition[] {
    return [...syntheticStore.values()]
      .filter((s) => s.pbAccountId === pbAccountId && s.status === 'ACTIVE');
  }

  // ── Financing facilities ──────────────────────────────────────────────────

  createFinancingFacility(pbAccountId: string, params: {
    financingType: FinancingType;
    currency: string;
    facilityLimit: string;
    rate: string;
    rateReference: string;
    collateralISINs?: string[];
    maturityDate?: string;
  }): FinancingFacility {
    this.getPBAccount(pbAccountId);

    const limit = new Decimal(params.facilityLimit);
    const facility: FinancingFacility = {
      facilityId:      uuidv4(),
      pbAccountId,
      financingType:   params.financingType,
      currency:        params.currency,
      facilityLimit:   limit.toFixed(2),
      drawn:           '0.00',
      available:       limit.toFixed(2),
      rate:            params.rate,
      rateReference:   params.rateReference,
      collateralISINs: params.collateralISINs ?? [],
      maturityDate:    params.maturityDate ?? null,
      status:          'ACTIVE',
    };
    facilityStore.set(facility.facilityId, facility);
    return facility;
  }

  drawFacility(facilityId: string, amount: string): FinancingFacility {
    const facility = facilityStore.get(facilityId);
    if (!facility) throw new NotFoundException(`Financing facility ${facilityId} not found`);
    if (facility.status !== 'ACTIVE') {
      throw new BadRequestException(`Facility ${facilityId} is not active`);
    }

    const draw      = new Decimal(amount);
    const available = new Decimal(facility.available);
    if (draw.gt(available)) {
      throw new BadRequestException(
        `Draw amount ${draw.toFixed(2)} exceeds available ${available.toFixed(2)}`,
      );
    }

    facility.drawn     = new Decimal(facility.drawn).plus(draw).toFixed(2);
    facility.available = available.minus(draw).toFixed(2);

    // Update account debit balance
    const account = pbAccountStore.get(facility.pbAccountId);
    if (account) {
      account.debitBalance   = new Decimal(account.debitBalance).plus(draw).toFixed(2);
      account.creditBalance  = Decimal.max(new Decimal(account.creditBalance).minus(draw), new Decimal(0)).toFixed(2);
      recalculateAccountMetrics(account, this.listPositions(facility.pbAccountId));
      pbAccountStore.set(facility.pbAccountId, account);
    }

    facilityStore.set(facilityId, facility);
    return facility;
  }

  listFacilities(pbAccountId: string): FinancingFacility[] {
    return [...facilityStore.values()].filter((f) => f.pbAccountId === pbAccountId);
  }

  // ── Rehypothecation ───────────────────────────────────────────────────────

  rehypothecatePosition(params: {
    pbAccountId: string;
    sourcePositionId: string;
    quantity: string;
    usedFor: string;
    counterpartyId: string;
    rate: string;
    maturityDate?: string;
  }): RehypothecationRecord {
    const account  = this.getPBAccount(params.pbAccountId);
    if (!account.rehypothecationEnabled) {
      throw new BadRequestException(`Rehypothecation is not enabled for account ${params.pbAccountId}`);
    }

    const position = positionStore.get(params.sourcePositionId);
    if (!position || position.pbAccountId !== params.pbAccountId) {
      throw new NotFoundException(`Position ${params.sourcePositionId} not found in account ${params.pbAccountId}`);
    }
    if (!position.eligibleAsCollateral) {
      throw new BadRequestException(`Position ${params.sourcePositionId} is not eligible as collateral`);
    }

    const qty    = new Decimal(params.quantity);
    const mv     = new Decimal(position.marketValue).abs()
      .times(qty.dividedBy(new Decimal(position.quantity)));

    const record: RehypothecationRecord = {
      rehypId:           uuidv4(),
      pbAccountId:       params.pbAccountId,
      sourcePositionId:  params.sourcePositionId,
      isin:              position.isin,
      quantity:          qty.toFixed(0),
      marketValue:       mv.toFixed(2),
      usedFor:           params.usedFor,
      counterpartyId:    params.counterpartyId,
      rate:              params.rate,
      startDate:         new Date().toISOString().split('T')[0]!,
      maturityDate:      params.maturityDate ?? null,
      status:            'ACTIVE',
    };

    position.rehypothecated = true;
    positionStore.set(params.sourcePositionId, position);
    rehypStore.set(record.rehypId, record);

    this.logger.log(`Rehypothecation ${record.rehypId}: ${qty.toFixed(0)} ${position.isin} used for "${params.usedFor}" @ ${params.rate}%`);
    return record;
  }

  returnRehypothecation(rehypId: string): RehypothecationRecord {
    const record = rehypStore.get(rehypId);
    if (!record) throw new NotFoundException(`Rehypothecation ${rehypId} not found`);
    if (record.status === 'RETURNED') throw new BadRequestException('Already returned');
    record.status = 'RETURNED';
    rehypStore.set(rehypId, record);

    const pos = positionStore.get(record.sourcePositionId);
    if (pos) {
      // Check if any other active rehyps reference this position
      const otherActive = [...rehypStore.values()].filter(
        (r) => r.sourcePositionId === record.sourcePositionId && r.status === 'ACTIVE',
      );
      if (otherActive.length === 0) {
        pos.rehypothecated = false;
        positionStore.set(record.sourcePositionId, pos);
      }
    }
    return record;
  }

  listRehypothecations(pbAccountId: string): RehypothecationRecord[] {
    return [...rehypStore.values()].filter((r) => r.pbAccountId === pbAccountId);
  }

  // ── Daily PB Report ───────────────────────────────────────────────────────

  generateDailyReport(pbAccountId: string, params: {
    mtdPnL: string;
    ytdPnL: string;
  }): PBDailyReport {
    const account     = this.getPBAccount(pbAccountId);
    const positions   = this.listPositions(pbAccountId);
    const synthetics  = this.listSynthetics(pbAccountId);
    const rehyps      = this.listRehypothecations(pbAccountId).filter((r) => r.status === 'ACTIVE');

    const dayPnL = positions.reduce(
      (sum, p) => sum.plus(new Decimal(p.dayPnL)), new Decimal(0),
    );

    const topPositions = [...positions]
      .sort((a, b) => new Decimal(b.marketValue).abs().minus(new Decimal(a.marketValue).abs()).toNumber())
      .slice(0, 10)
      .map((p) => ({
        isin:          p.isin,
        description:   p.description,
        side:          p.side,
        marketValue:   p.marketValue,
        unrealizedPnL: p.unrealizedPnL,
      }));

    const syntheticExposure = synthetics.reduce(
      (sum, s) => sum.plus(new Decimal(s.notionalValue)), new Decimal(0),
    );

    const totalFinancingCost = positions.reduce(
      (sum, p) => sum.plus(new Decimal(p.financingCostAccrued)), new Decimal(0),
    ).plus(
      synthetics.reduce((sum, s) => sum.plus(new Decimal(s.accruedFinancingCost)), new Decimal(0)),
    );

    const rehypValue = rehyps.reduce(
      (sum, r) => sum.plus(new Decimal(r.marketValue)), new Decimal(0),
    );

    const report: PBDailyReport = {
      reportId:            uuidv4(),
      pbAccountId,
      reportDate:          new Date().toISOString().split('T')[0]!,
      reportType:          'DAILY_BALANCE',
      nav:                 account.netAssetValue,
      longMV:              account.longMarketValue,
      shortMV:             account.shortMarketValue,
      netMV:               account.netMarketValue,
      grossMV:             account.grossMarketValue,
      grossLeverage:       account.grossLeverage,
      netLeverage:         account.netLeverage,
      debitBalance:        account.debitBalance,
      creditBalance:       account.creditBalance,
      dayPnL:              dayPnL.toFixed(2),
      mtdPnL:              new Decimal(params.mtdPnL).toFixed(2),
      ytdPnL:              new Decimal(params.ytdPnL).toFixed(2),
      imRequired:          account.initialMarginRequired,
      mmRequired:          account.maintenanceMarginRequired,
      excessMargin:        account.excessMargin,
      topPositions,
      syntheticExposure:   syntheticExposure.toFixed(2),
      totalFinancingCost:  totalFinancingCost.toFixed(2),
      rehypothecatedValue: rehypValue.toFixed(2),
    };

    reportStore.set(report.reportId, report);
    this.logger.log(`Daily report ${report.reportId} for account ${pbAccountId}: NAV=${account.netAssetValue} leverage=${account.grossLeverage}x`);
    return report;
  }

  getReport(reportId: string): PBDailyReport {
    const r = reportStore.get(reportId);
    if (!r) throw new NotFoundException(`Report ${reportId} not found`);
    return r;
  }

  listReports(pbAccountId: string): PBDailyReport[] {
    return [...reportStore.values()]
      .filter((r) => r.pbAccountId === pbAccountId)
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  }

  // ── Book summary ──────────────────────────────────────────────────────────

  getBookSummary(): {
    totalAccounts: number;
    totalNAV: string;
    totalGrossExposure: string;
    totalSyntheticNotional: string;
    totalDebitBalance: string;
    averageGrossLeverage: string;
    accountsByType: Record<PBAccountType, number>;
    marginCallAccounts: Array<{ pbAccountId: string; clientName: string; excessMargin: string }>;
  } {
    const accounts = [...pbAccountStore.values()].filter((a) => a.status === 'ACTIVE');

    let totalNAV        = new Decimal(0);
    let totalGrossMV    = new Decimal(0);
    let totalDebit      = new Decimal(0);
    let leverageSum     = new Decimal(0);
    const byType: Record<string, number> = {};

    for (const acct of accounts) {
      totalNAV     = totalNAV.plus(new Decimal(acct.netAssetValue));
      totalGrossMV = totalGrossMV.plus(new Decimal(acct.grossMarketValue));
      totalDebit   = totalDebit.plus(new Decimal(acct.debitBalance));
      leverageSum  = leverageSum.plus(new Decimal(acct.grossLeverage));
      byType[acct.accountType] = (byType[acct.accountType] ?? 0) + 1;
    }

    const allSynthetics = [...syntheticStore.values()].filter((s) => s.status === 'ACTIVE');
    const totalSynthNotional = allSynthetics.reduce(
      (sum, s) => sum.plus(new Decimal(s.notionalValue)), new Decimal(0),
    );

    const marginCallAccounts = accounts
      .filter((a) => new Decimal(a.excessMargin).lt(0))
      .map((a) => ({ pbAccountId: a.pbAccountId, clientName: a.clientName, excessMargin: a.excessMargin }));

    return {
      totalAccounts:          accounts.length,
      totalNAV:               totalNAV.toFixed(2),
      totalGrossExposure:     totalGrossMV.toFixed(2),
      totalSyntheticNotional: totalSynthNotional.toFixed(2),
      totalDebitBalance:      totalDebit.toFixed(2),
      averageGrossLeverage:   accounts.length === 0
        ? '0.0000'
        : leverageSum.dividedBy(accounts.length).toFixed(4),
      accountsByType:         byType as Record<PBAccountType, number>,
      marginCallAccounts,
    };
  }
}
