import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type CollateralAssetType =
  | 'GOVERNMENT_BOND'
  | 'AGENCY_BOND'
  | 'CORPORATE_BOND'
  | 'EQUITY'
  | 'MONEY_MARKET'
  | 'CASH'
  | 'LETTER_OF_CREDIT'
  | 'MORTGAGE_BACKED'
  | 'COVERED_BOND'
  | 'CONVERTIBLE_BOND';

export type CollateralStatus =
  | 'AVAILABLE'
  | 'PLEDGED'
  | 'LOCKED'
  | 'IN_TRANSIT'
  | 'SUBSTITUTION_PENDING'
  | 'RELEASED';

export type PledgeStatus =
  | 'ACTIVE'
  | 'PARTIALLY_RELEASED'
  | 'FULLY_RELEASED'
  | 'CALLED'
  | 'DEFAULTED';

export type EligibilitySchedule =
  | 'ISDA_VM'      // ISDA 2016 VM Credit Support Annex
  | 'ISDA_IM'      // ISDA 2016 IM Credit Support Deed
  | 'EUREX_CLEARING'
  | 'LCH_CLEARNET'
  | 'CME_CLEARING'
  | 'BILATERAL';

// ── Haircut tables by asset type and schedule ─────────────────────────────────
// Haircut = % deducted from market value to get collateral value
// e.g. haircut 5% → $100 security gives $95 eligible collateral

const HAIRCUT_TABLE: Record<CollateralAssetType, Record<EligibilitySchedule, number>> = {
  CASH: {
    ISDA_VM: 0, ISDA_IM: 0, EUREX_CLEARING: 0,
    LCH_CLEARNET: 0, CME_CLEARING: 0, BILATERAL: 0,
  },
  GOVERNMENT_BOND: {
    ISDA_VM: 2, ISDA_IM: 4, EUREX_CLEARING: 1,
    LCH_CLEARNET: 1.5, CME_CLEARING: 2, BILATERAL: 2,
  },
  AGENCY_BOND: {
    ISDA_VM: 4, ISDA_IM: 6, EUREX_CLEARING: 3,
    LCH_CLEARNET: 4, CME_CLEARING: 4, BILATERAL: 4,
  },
  COVERED_BOND: {
    ISDA_VM: 6, ISDA_IM: 8, EUREX_CLEARING: 5,
    LCH_CLEARNET: 6, CME_CLEARING: 6, BILATERAL: 6,
  },
  CORPORATE_BOND: {
    ISDA_VM: 8, ISDA_IM: 12, EUREX_CLEARING: 8,
    LCH_CLEARNET: 10, CME_CLEARING: 10, BILATERAL: 8,
  },
  MORTGAGE_BACKED: {
    ISDA_VM: 10, ISDA_IM: 15, EUREX_CLEARING: 10,
    LCH_CLEARNET: 12, CME_CLEARING: 12, BILATERAL: 10,
  },
  EQUITY: {
    ISDA_VM: 15, ISDA_IM: 20, EUREX_CLEARING: 15,
    LCH_CLEARNET: 15, CME_CLEARING: 15, BILATERAL: 15,
  },
  CONVERTIBLE_BOND: {
    ISDA_VM: 15, ISDA_IM: 20, EUREX_CLEARING: 15,
    LCH_CLEARNET: 15, CME_CLEARING: 18, BILATERAL: 15,
  },
  MONEY_MARKET: {
    ISDA_VM: 1, ISDA_IM: 2, EUREX_CLEARING: 1,
    LCH_CLEARNET: 1, CME_CLEARING: 1, BILATERAL: 1,
  },
  LETTER_OF_CREDIT: {
    ISDA_VM: 0, ISDA_IM: 0, EUREX_CLEARING: 0,
    LCH_CLEARNET: 0, CME_CLEARING: 0, BILATERAL: 0,
  },
};

// Residual maturity add-on (basis points, converted to %)
// > 10 years gets extra haircut
const MATURITY_ADDON: Record<CollateralAssetType, number> = {
  GOVERNMENT_BOND:  1,    // 1% addon for >10y
  AGENCY_BOND:      2,
  COVERED_BOND:     2,
  CORPORATE_BOND:   3,
  MORTGAGE_BACKED:  4,
  CONVERTIBLE_BOND: 3,
  CASH:             0,
  EQUITY:           0,
  MONEY_MARKET:     0,
  LETTER_OF_CREDIT: 0,
};

// ── Core interfaces ───────────────────────────────────────────────────────────

export interface CollateralAsset {
  assetId: string;
  counterpartyId: string;
  portfolioId: string;
  isin: string;
  description: string;
  assetType: CollateralAssetType;
  currency: string;
  nominalQuantity: string;
  currentPrice: string;          // per unit (bond: per 100 par)
  marketValue: string;
  accruedInterest: string;       // dirty price component
  dirtyValue: string;            // marketValue + accruedInterest
  maturityDate: string | null;
  couponRate: string | null;     // for bonds
  creditRating: string | null;   // e.g. 'AAA', 'BBB+'
  residualMaturityYears: number | null;
  status: CollateralStatus;
  eligibleSchedules: EligibilitySchedule[];
  custodian: string;
  custodianAccountId: string;
  lastPricedAt: string;
}

export interface HaircutResult {
  assetId: string;
  schedule: EligibilitySchedule;
  marketValue: string;
  dirtyValue: string;
  baseHaircutPct: number;
  maturityAddonPct: number;
  totalHaircutPct: number;
  eligibleValue: string;        // dirtyValue × (1 - totalHaircut/100)
  ineligible: boolean;
  ineligibilityReason: string | null;
}

export interface CollateralPledge {
  pledgeId: string;
  counterpartyId: string;
  agreementId: string;           // CSA / GMRA / GMSLA reference
  schedule: EligibilitySchedule;
  pledgedAssets: PledgeAsset[];
  totalMarketValue: string;
  totalEligibleValue: string;
  requiredCollateralValue: string;
  surplusDeficit: string;        // positive = surplus, negative = shortfall
  status: PledgeStatus;
  pledgedAt: string;
  lastUpdatedAt: string;
  expiryDate: string | null;
}

export interface PledgeAsset {
  assetId: string;
  isin: string;
  description: string;
  assetType: CollateralAssetType;
  quantity: string;
  marketValue: string;
  haircutPct: number;
  eligibleValue: string;
}

export interface SubstitutionRequest {
  requestId: string;
  pledgeId: string;
  counterpartyId: string;
  outAssetId: string;     // asset to remove from pledge
  inAssetId: string;      // asset to add to pledge
  outQuantity: string;
  inQuantity: string;
  outEligibleValue: string;
  inEligibleValue: string;
  valueDifference: string;  // in - out (positive = net new collateral posted)
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SETTLED';
  requestedAt: string;
  settledAt: string | null;
  reason: string;
}

export interface CollateralOptimizationResult {
  counterpartyId: string;
  requiredValue: string;
  schedule: EligibilitySchedule;
  recommendedAssets: Array<{
    assetId: string;
    isin: string;
    description: string;
    assetType: CollateralAssetType;
    allocationQuantity: string;
    marketValue: string;
    eligibleValue: string;
    haircutPct: number;
    opportunityCostRank: number;   // 1 = cheapest-to-deliver first
  }>;
  totalEligibleValue: string;
  surplus: string;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const assetStore        = new Map<string, CollateralAsset>();
const pledgeStore       = new Map<string, CollateralPledge>();
const substitutionStore = new Map<string, SubstitutionRequest>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeHaircut(
  asset: CollateralAsset,
  schedule: EligibilitySchedule,
): HaircutResult {
  const haircutTable = HAIRCUT_TABLE[asset.assetType];
  const baseHaircut  = haircutTable[schedule] ?? 100;  // 100 = ineligible

  // Maturity add-on for bonds > 10 years residual
  const maturityAddon = (asset.residualMaturityYears ?? 0) > 10
    ? (MATURITY_ADDON[asset.assetType] ?? 0)
    : 0;

  const totalHaircut = baseHaircut + maturityAddon;
  const ineligible   = totalHaircut >= 100;

  const dirtyVal     = new Decimal(asset.dirtyValue);
  const eligibleVal  = ineligible
    ? new Decimal(0)
    : dirtyVal.times(new Decimal(1).minus(new Decimal(totalHaircut).dividedBy(100)));

  // Check credit rating eligibility for IM schedules
  let ineligibilityReason: string | null = null;
  if (ineligible) {
    ineligibilityReason = `Asset type ${asset.assetType} not eligible under ${schedule}`;
  } else if (schedule === 'ISDA_IM' && asset.creditRating) {
    // IM requires minimum A- for corporates
    const subInvGrade = ['BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC', 'CC', 'C', 'D'];
    if (asset.assetType === 'CORPORATE_BOND' && subInvGrade.includes(asset.creditRating)) {
      return {
        assetId: asset.assetId, schedule,
        marketValue: asset.marketValue, dirtyValue: asset.dirtyValue,
        baseHaircutPct: baseHaircut, maturityAddonPct: maturityAddon,
        totalHaircutPct: 100, eligibleValue: '0.00',
        ineligible: true,
        ineligibilityReason: `Corporate bond rated ${asset.creditRating} below minimum A- for ${schedule}`,
      };
    }
  }

  return {
    assetId:           asset.assetId,
    schedule,
    marketValue:       asset.marketValue,
    dirtyValue:        asset.dirtyValue,
    baseHaircutPct:    baseHaircut,
    maturityAddonPct:  maturityAddon,
    totalHaircutPct:   totalHaircut,
    eligibleValue:     eligibleVal.toFixed(2),
    ineligible,
    ineligibilityReason,
  };
}

// Cheapest-to-deliver ranking: rank by opportunity cost (lowest-haircut = highest cost to pledge)
// In practice we want to pledge highest-haircut assets first (cheapest-to-deliver)
function opportunityCostRank(haircut: number): number {
  // Higher haircut → lower opportunity cost → pledge first → lower rank number
  // We'll return inverted so 1 = post this first (highest haircut)
  return Math.round(100 - haircut);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CollateralManagementService {
  private readonly logger = new Logger(CollateralManagementService.name);

  // ── Asset inventory ────────────────────────────────────────────────────────

  registerAsset(params: {
    counterpartyId: string;
    portfolioId: string;
    isin: string;
    description: string;
    assetType: CollateralAssetType;
    currency: string;
    nominalQuantity: string;
    currentPrice: string;
    accruedInterest?: string;
    maturityDate?: string;
    couponRate?: string;
    creditRating?: string;
    residualMaturityYears?: number;
    eligibleSchedules: EligibilitySchedule[];
    custodian: string;
    custodianAccountId: string;
  }): CollateralAsset {
    const mv     = new Decimal(params.nominalQuantity).times(new Decimal(params.currentPrice)).dividedBy(100);
    const ai     = new Decimal(params.accruedInterest ?? '0');
    const dirty  = mv.plus(ai);

    const asset: CollateralAsset = {
      assetId:                uuidv4(),
      counterpartyId:         params.counterpartyId,
      portfolioId:            params.portfolioId,
      isin:                   params.isin,
      description:            params.description,
      assetType:              params.assetType,
      currency:               params.currency,
      nominalQuantity:        new Decimal(params.nominalQuantity).toFixed(2),
      currentPrice:           new Decimal(params.currentPrice).toFixed(6),
      marketValue:            mv.toFixed(2),
      accruedInterest:        ai.toFixed(2),
      dirtyValue:             dirty.toFixed(2),
      maturityDate:           params.maturityDate ?? null,
      couponRate:             params.couponRate ?? null,
      creditRating:           params.creditRating ?? null,
      residualMaturityYears:  params.residualMaturityYears ?? null,
      status:                 'AVAILABLE',
      eligibleSchedules:      params.eligibleSchedules,
      custodian:              params.custodian,
      custodianAccountId:     params.custodianAccountId,
      lastPricedAt:           new Date().toISOString(),
    };
    assetStore.set(asset.assetId, asset);
    this.logger.log(`Registered collateral asset ${asset.assetId} (${asset.isin}) MV=${mv.toFixed(2)} ${params.currency}`);
    return asset;
  }

  updateAssetPrice(assetId: string, newPrice: string, accruedInterest?: string): CollateralAsset {
    const asset = this.getAsset(assetId);
    const price = new Decimal(newPrice);
    const mv    = new Decimal(asset.nominalQuantity).times(price).dividedBy(100);
    const ai    = new Decimal(accruedInterest ?? asset.accruedInterest);
    const dirty = mv.plus(ai);

    asset.currentPrice    = price.toFixed(6);
    asset.marketValue     = mv.toFixed(2);
    asset.accruedInterest = ai.toFixed(2);
    asset.dirtyValue      = dirty.toFixed(2);
    asset.lastPricedAt    = new Date().toISOString();
    assetStore.set(assetId, asset);
    return asset;
  }

  getAsset(assetId: string): CollateralAsset {
    const a = assetStore.get(assetId);
    if (!a) throw new NotFoundException(`Collateral asset ${assetId} not found`);
    return a;
  }

  listAssets(counterpartyId?: string, status?: CollateralStatus): CollateralAsset[] {
    let all = [...assetStore.values()];
    if (counterpartyId) all = all.filter((a) => a.counterpartyId === counterpartyId);
    if (status)         all = all.filter((a) => a.status === status);
    return all;
  }

  // ── Haircut calculation ────────────────────────────────────────────────────

  calculateHaircut(assetId: string, schedule: EligibilitySchedule): HaircutResult {
    const asset = this.getAsset(assetId);
    return computeHaircut(asset, schedule);
  }

  calculateHaircutsForPortfolio(
    counterpartyId: string,
    schedule: EligibilitySchedule,
  ): HaircutResult[] {
    const assets = this.listAssets(counterpartyId, 'AVAILABLE');
    return assets.map((a) => computeHaircut(a, schedule));
  }

  // ── Pledge management ─────────────────────────────────────────────────────

  createPledge(params: {
    counterpartyId: string;
    agreementId: string;
    schedule: EligibilitySchedule;
    assetAllocations: Array<{ assetId: string; quantity: string }>;
    requiredCollateralValue: string;
    expiryDate?: string;
  }): CollateralPledge {
    const pledgeAssets: PledgeAsset[] = [];
    let totalMV       = new Decimal(0);
    let totalEligible = new Decimal(0);

    for (const alloc of params.assetAllocations) {
      const asset  = this.getAsset(alloc.assetId);

      if (asset.counterpartyId !== params.counterpartyId) {
        throw new BadRequestException(
          `Asset ${alloc.assetId} does not belong to counterparty ${params.counterpartyId}`,
        );
      }
      if (asset.status !== 'AVAILABLE') {
        throw new BadRequestException(
          `Asset ${alloc.assetId} is not available for pledging (status: ${asset.status})`,
        );
      }
      if (!asset.eligibleSchedules.includes(params.schedule)) {
        throw new BadRequestException(
          `Asset ${alloc.assetId} (${asset.isin}) is not eligible under schedule ${params.schedule}`,
        );
      }

      const qty     = new Decimal(alloc.quantity);
      const pricePerUnit = new Decimal(asset.currentPrice).dividedBy(100);
      const mv      = qty.times(pricePerUnit);
      const hc      = computeHaircut(asset, params.schedule);
      const eligible = new Decimal(hc.eligibleValue)
        .times(qty.dividedBy(new Decimal(asset.nominalQuantity)));

      pledgeAssets.push({
        assetId:     asset.assetId,
        isin:        asset.isin,
        description: asset.description,
        assetType:   asset.assetType,
        quantity:    qty.toFixed(2),
        marketValue: mv.toFixed(2),
        haircutPct:  hc.totalHaircutPct,
        eligibleValue: eligible.toFixed(2),
      });

      totalMV       = totalMV.plus(mv);
      totalEligible = totalEligible.plus(eligible);

      // Mark asset as pledged
      asset.status = 'PLEDGED';
      assetStore.set(asset.assetId, asset);
    }

    const required = new Decimal(params.requiredCollateralValue);
    const surplus  = totalEligible.minus(required);

    const pledge: CollateralPledge = {
      pledgeId:               uuidv4(),
      counterpartyId:         params.counterpartyId,
      agreementId:            params.agreementId,
      schedule:               params.schedule,
      pledgedAssets:          pledgeAssets,
      totalMarketValue:       totalMV.toFixed(2),
      totalEligibleValue:     totalEligible.toFixed(2),
      requiredCollateralValue: required.toFixed(2),
      surplusDeficit:         surplus.toFixed(2),
      status:                 'ACTIVE',
      pledgedAt:              new Date().toISOString(),
      lastUpdatedAt:          new Date().toISOString(),
      expiryDate:             params.expiryDate ?? null,
    };

    pledgeStore.set(pledge.pledgeId, pledge);
    this.logger.log(
      `Pledge ${pledge.pledgeId}: eligible ${totalEligible.toFixed(2)}, required ${required.toFixed(2)}, ` +
      `surplus/deficit ${surplus.toFixed(2)}`,
    );
    return pledge;
  }

  getPledge(pledgeId: string): CollateralPledge {
    const p = pledgeStore.get(pledgeId);
    if (!p) throw new NotFoundException(`Pledge ${pledgeId} not found`);
    return p;
  }

  listPledges(counterpartyId?: string, status?: PledgeStatus): CollateralPledge[] {
    let all = [...pledgeStore.values()];
    if (counterpartyId) all = all.filter((p) => p.counterpartyId === counterpartyId);
    if (status)         all = all.filter((p) => p.status === status);
    return all;
  }

  releasePledge(pledgeId: string, partial?: { assetId: string }): CollateralPledge {
    const pledge = this.getPledge(pledgeId);
    if (pledge.status !== 'ACTIVE' && pledge.status !== 'PARTIALLY_RELEASED') {
      throw new BadRequestException(`Pledge ${pledgeId} is not active (status: ${pledge.status})`);
    }

    if (partial) {
      // Release a single asset from the pledge
      const idx = pledge.pledgedAssets.findIndex((a) => a.assetId === partial.assetId);
      if (idx === -1) throw new NotFoundException(`Asset ${partial.assetId} not found in pledge ${pledgeId}`);

      pledge.pledgedAssets.splice(idx, 1);

      const asset = assetStore.get(partial.assetId);
      if (asset) { asset.status = 'AVAILABLE'; assetStore.set(partial.assetId, asset); }

      // Recalculate totals
      const newMV  = pledge.pledgedAssets.reduce((s, a) => s.plus(new Decimal(a.marketValue)), new Decimal(0));
      const newElig = pledge.pledgedAssets.reduce((s, a) => s.plus(new Decimal(a.eligibleValue)), new Decimal(0));
      pledge.totalMarketValue   = newMV.toFixed(2);
      pledge.totalEligibleValue = newElig.toFixed(2);
      pledge.surplusDeficit     = newElig.minus(new Decimal(pledge.requiredCollateralValue)).toFixed(2);
      pledge.status             = pledge.pledgedAssets.length === 0 ? 'FULLY_RELEASED' : 'PARTIALLY_RELEASED';
    } else {
      // Full release
      for (const pa of pledge.pledgedAssets) {
        const asset = assetStore.get(pa.assetId);
        if (asset) { asset.status = 'AVAILABLE'; assetStore.set(pa.assetId, asset); }
      }
      pledge.status = 'FULLY_RELEASED';
    }

    pledge.lastUpdatedAt = new Date().toISOString();
    pledgeStore.set(pledgeId, pledge);
    return pledge;
  }

  // ── Collateral substitution ────────────────────────────────────────────────

  requestSubstitution(params: {
    pledgeId: string;
    outAssetId: string;
    inAssetId: string;
    outQuantity: string;
    inQuantity: string;
    reason: string;
  }): SubstitutionRequest {
    const pledge   = this.getPledge(params.pledgeId);
    if (pledge.status !== 'ACTIVE') {
      throw new BadRequestException(`Pledge ${params.pledgeId} is not active`);
    }

    const outAsset = this.getAsset(params.outAssetId);
    const inAsset  = this.getAsset(params.inAssetId);

    if (inAsset.status !== 'AVAILABLE') {
      throw new BadRequestException(`Incoming asset ${params.inAssetId} is not available`);
    }

    const outHC = computeHaircut(outAsset, pledge.schedule);
    const inHC  = computeHaircut(inAsset, pledge.schedule);

    const outQty = new Decimal(params.outQuantity);
    const inQty  = new Decimal(params.inQuantity);

    // Pro-rate eligible values by quantity fraction
    const outFraction = outQty.dividedBy(new Decimal(outAsset.nominalQuantity));
    const inFraction  = inQty.dividedBy(new Decimal(inAsset.nominalQuantity));

    const outEligible = new Decimal(outHC.eligibleValue).times(outFraction);
    const inEligible  = new Decimal(inHC.eligibleValue).times(inFraction);
    const valueDiff   = inEligible.minus(outEligible);

    const sub: SubstitutionRequest = {
      requestId:        uuidv4(),
      pledgeId:         params.pledgeId,
      counterpartyId:   pledge.counterpartyId,
      outAssetId:       params.outAssetId,
      inAssetId:        params.inAssetId,
      outQuantity:      outQty.toFixed(2),
      inQuantity:       inQty.toFixed(2),
      outEligibleValue: outEligible.toFixed(2),
      inEligibleValue:  inEligible.toFixed(2),
      valueDifference:  valueDiff.toFixed(2),
      status:           'PENDING',
      requestedAt:      new Date().toISOString(),
      settledAt:        null,
      reason:           params.reason,
    };

    // Mark incoming as IN_TRANSIT
    inAsset.status = 'IN_TRANSIT';
    assetStore.set(params.inAssetId, inAsset);

    // Mark pledge as substitution pending
    pledge.status = 'ACTIVE'; // keep active; substitution in progress
    const outAssetPledge = assetStore.get(params.outAssetId);
    if (outAssetPledge) {
      outAssetPledge.status = 'SUBSTITUTION_PENDING';
      assetStore.set(params.outAssetId, outAssetPledge);
    }

    substitutionStore.set(sub.requestId, sub);
    this.logger.log(`Substitution request ${sub.requestId}: out=${outAsset.isin} qty=${outQty.toFixed(0)}, in=${inAsset.isin} qty=${inQty.toFixed(0)}, net ${valueDiff.toFixed(2)}`);
    return sub;
  }

  settleSubstitution(requestId: string): SubstitutionRequest {
    const sub = substitutionStore.get(requestId);
    if (!sub) throw new NotFoundException(`Substitution request ${requestId} not found`);
    if (sub.status !== 'PENDING') {
      throw new BadRequestException(`Substitution ${requestId} is in status ${sub.status}`);
    }

    const pledge  = this.getPledge(sub.pledgeId);
    const outAsset = assetStore.get(sub.outAssetId);
    const inAsset  = assetStore.get(sub.inAssetId);

    // Remove out-asset from pledge, release it
    const idx = pledge.pledgedAssets.findIndex((a) => a.assetId === sub.outAssetId);
    if (idx !== -1) pledge.pledgedAssets.splice(idx, 1);
    if (outAsset) { outAsset.status = 'AVAILABLE'; assetStore.set(sub.outAssetId, outAsset); }

    // Add in-asset to pledge
    if (inAsset) {
      const inHC = computeHaircut(inAsset, pledge.schedule);
      pledge.pledgedAssets.push({
        assetId:       inAsset.assetId,
        isin:          inAsset.isin,
        description:   inAsset.description,
        assetType:     inAsset.assetType,
        quantity:      sub.inQuantity,
        marketValue:   new Decimal(inAsset.marketValue)
          .times(new Decimal(sub.inQuantity).dividedBy(new Decimal(inAsset.nominalQuantity)))
          .toFixed(2),
        haircutPct:    inHC.totalHaircutPct,
        eligibleValue: sub.inEligibleValue,
      });
      inAsset.status = 'PLEDGED';
      assetStore.set(sub.inAssetId, inAsset);
    }

    // Recalculate pledge totals
    const newMV   = pledge.pledgedAssets.reduce((s, a) => s.plus(new Decimal(a.marketValue)), new Decimal(0));
    const newElig = pledge.pledgedAssets.reduce((s, a) => s.plus(new Decimal(a.eligibleValue)), new Decimal(0));
    pledge.totalMarketValue   = newMV.toFixed(2);
    pledge.totalEligibleValue = newElig.toFixed(2);
    pledge.surplusDeficit     = newElig.minus(new Decimal(pledge.requiredCollateralValue)).toFixed(2);
    pledge.lastUpdatedAt      = new Date().toISOString();
    pledgeStore.set(sub.pledgeId, pledge);

    sub.status    = 'SETTLED';
    sub.settledAt = new Date().toISOString();
    substitutionStore.set(requestId, sub);
    this.logger.log(`Substitution ${requestId} settled`);
    return sub;
  }

  listSubstitutions(pledgeId?: string): SubstitutionRequest[] {
    const all = [...substitutionStore.values()];
    return pledgeId ? all.filter((s) => s.pledgeId === pledgeId) : all;
  }

  // ── Collateral optimization (cheapest-to-deliver) ─────────────────────────

  optimizeCollateral(params: {
    counterpartyId: string;
    requiredValue: string;
    schedule: EligibilitySchedule;
  }): CollateralOptimizationResult {
    const available = this.listAssets(params.counterpartyId, 'AVAILABLE')
      .filter((a) => a.eligibleSchedules.includes(params.schedule));

    const required = new Decimal(params.requiredValue);
    let filled     = new Decimal(0);

    // Score each asset: cheapest-to-deliver = highest haircut (we "waste" less value)
    const scored = available
      .map((a) => {
        const hc = computeHaircut(a, params.schedule);
        return { asset: a, haircut: hc, rank: opportunityCostRank(hc.totalHaircutPct) };
      })
      .filter((s) => !s.haircut.ineligible)
      .sort((a, b) => a.rank - b.rank);   // ascending rank = highest haircut first (CTD)

    const recommendations: CollateralOptimizationResult['recommendedAssets'] = [];

    for (const { asset, haircut, rank } of scored) {
      if (filled.gte(required)) break;

      const remaining = required.minus(filled);
      const available_eligible = new Decimal(haircut.eligibleValue);

      // Determine allocation fraction
      const fraction = available_eligible.gt(remaining)
        ? remaining.dividedBy(available_eligible)
        : new Decimal(1);

      const allocatedQty   = new Decimal(asset.nominalQuantity).times(fraction);
      const allocatedMV    = new Decimal(asset.marketValue).times(fraction);
      const allocatedElig  = available_eligible.times(fraction);

      recommendations.push({
        assetId:              asset.assetId,
        isin:                 asset.isin,
        description:          asset.description,
        assetType:            asset.assetType,
        allocationQuantity:   allocatedQty.toFixed(2),
        marketValue:          allocatedMV.toFixed(2),
        eligibleValue:        allocatedElig.toFixed(2),
        haircutPct:           haircut.totalHaircutPct,
        opportunityCostRank:  rank,
      });

      filled = filled.plus(allocatedElig);
    }

    const surplus = filled.minus(required);

    this.logger.log(
      `Optimization for ${params.counterpartyId}: required ${required.toFixed(2)}, ` +
      `allocated ${filled.toFixed(2)}, surplus ${surplus.toFixed(2)}`,
    );

    return {
      counterpartyId:    params.counterpartyId,
      requiredValue:     required.toFixed(2),
      schedule:          params.schedule,
      recommendedAssets: recommendations,
      totalEligibleValue: filled.toFixed(2),
      surplus:           surplus.toFixed(2),
    };
  }

  // ── Inventory summary ─────────────────────────────────────────────────────

  getInventorySummary(counterpartyId?: string): {
    totalAssets: number;
    byStatus: Record<CollateralStatus, { count: number; marketValue: string }>;
    byAssetType: Record<string, { count: number; marketValue: string }>;
    totalMarketValue: string;
    totalPledgedValue: string;
    totalAvailableValue: string;
  } {
    const assets = counterpartyId
      ? this.listAssets(counterpartyId)
      : [...assetStore.values()];

    const byStatus: Record<string, { count: number; mv: Decimal }> = {};
    const byType:   Record<string, { count: number; mv: Decimal }> = {};
    let totalMV = new Decimal(0);

    for (const a of assets) {
      if (!byStatus[a.status]) byStatus[a.status] = { count: 0, mv: new Decimal(0) };
      byStatus[a.status]!.count++;
      byStatus[a.status]!.mv = byStatus[a.status]!.mv.plus(new Decimal(a.marketValue));

      if (!byType[a.assetType]) byType[a.assetType] = { count: 0, mv: new Decimal(0) };
      byType[a.assetType]!.count++;
      byType[a.assetType]!.mv = byType[a.assetType]!.mv.plus(new Decimal(a.marketValue));

      totalMV = totalMV.plus(new Decimal(a.marketValue));
    }

    const pledgedMV   = byStatus['PLEDGED']?.mv ?? new Decimal(0);
    const availableMV = byStatus['AVAILABLE']?.mv ?? new Decimal(0);

    const statusOut: Record<string, { count: number; marketValue: string }> = {};
    for (const [s, v] of Object.entries(byStatus)) {
      statusOut[s] = { count: v.count, marketValue: v.mv.toFixed(2) };
    }
    const typeOut: Record<string, { count: number; marketValue: string }> = {};
    for (const [t, v] of Object.entries(byType)) {
      typeOut[t] = { count: v.count, marketValue: v.mv.toFixed(2) };
    }

    return {
      totalAssets:         assets.length,
      byStatus:            statusOut as Record<CollateralStatus, { count: number; marketValue: string }>,
      byAssetType:         typeOut,
      totalMarketValue:    totalMV.toFixed(2),
      totalPledgedValue:   pledgedMV.toFixed(2),
      totalAvailableValue: availableMV.toFixed(2),
    };
  }
}
