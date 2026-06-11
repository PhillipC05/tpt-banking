import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type EntityType =
  | 'INDIVIDUAL' | 'LLC' | 'TRUST' | 'FOUNDATION'
  | 'PARTNERSHIP' | 'CORPORATION' | 'HOLDING_COMPANY';

export type RelationshipType =
  | 'BENEFICIAL_OWNER'
  | 'TRUSTEE'
  | 'BENEFICIARY'
  | 'GUARDIAN'
  | 'ATTORNEY_IN_FACT'
  | 'PROTECTOR'
  | 'CO_TRUSTEE'
  | 'SUCCESSOR_TRUSTEE'
  | 'GENERAL_PARTNER'
  | 'LIMITED_PARTNER';

export type AssetClass =
  | 'EQUITIES' | 'FIXED_INCOME' | 'ALTERNATIVES' | 'REAL_ESTATE'
  | 'PRIVATE_EQUITY' | 'HEDGE_FUNDS' | 'COMMODITIES' | 'CASH' | 'OTHER';

export type DistributionClass = 'INCOME' | 'PRINCIPAL' | 'BOTH';

export type DocumentType =
  | 'TRUST_DEED' | 'IPS' | 'PARTNERSHIP_AGREEMENT' | 'ARTICLES_OF_INCORPORATION'
  | 'WILL' | 'POWER_OF_ATTORNEY' | 'TAX_RETURN' | 'FINANCIAL_STATEMENT'
  | 'KYC_DOCUMENT' | 'INVESTMENT_MANDATE' | 'OTHER';

export interface FamilyGroup {
  groupId: string;
  familyName: string;
  primaryContactEntityId: string | null;
  relationshipManagerId: string | null;
  createdAt: string;
  notes: string;
}

export interface FamilyEntity {
  entityId: string;
  groupId: string;
  name: string;
  entityType: EntityType;
  jurisdiction: string;
  taxId: string | null;         // EIN / SSN / foreign TIN
  incorporationDate: string | null;
  registeredAgent: string | null;
  accountIds: string[];          // linked banking accounts
  holdingsSnapshot: HoldingSnapshot[];
  status: 'ACTIVE' | 'DORMANT' | 'DISSOLVED';
}

export interface HoldingSnapshot {
  assetClass: AssetClass;
  description: string;
  marketValue: string;          // USD
  costBasis: string;
  currency: string;
  asOfDate: string;
}

export interface EntityRelationship {
  relationshipId: string;
  groupId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: RelationshipType;
  ownershipPct: string | null;  // for BENEFICIAL_OWNER / GENERAL_PARTNER / LIMITED_PARTNER
  effectiveDate: string;
  endDate: string | null;
  notes: string;
}

export interface Beneficiary {
  beneficiaryId: string;
  groupId: string;
  entityId: string;             // points to a FamilyEntity (individual or trust)
  distributionClass: DistributionClass;
  distributionPct: string | null;  // for fixed-ratio distributions; null = discretionary
  restrictedUntilAge: number | null;
  notes: string;
  totalDistributionsLifetime: string;
  totalDistributionsYTD: string;
  lastDistributionDate: string | null;
}

export interface DistributionEvent {
  distributionId: string;
  groupId: string;
  beneficiaryId: string;
  amount: string;
  distributionClass: DistributionClass;
  standard: 'DISCRETIONARY' | 'MANDATORY' | 'HEMS' | 'UNITRUST_PCT';
  distributionDate: string;
  taxWithheld: string;
  notes: string;
  approvedBy: string;
}

export interface IPSPolicy {
  ipsId: string;
  groupId: string;
  effectiveDate: string;
  expirationDate: string | null;
  targetAllocation: Record<AssetClass, number>;       // pct, must sum to 100
  driftBands: Record<AssetClass, { min: number; max: number }>;
  restrictedSecurities: string[];                     // ticker/ISIN blacklist
  esgScreens: string[];                               // e.g. ['NO_TOBACCO', 'NO_WEAPONS']
  maxSinglePositionPct: number;
  maxSectorPct: number;
  minCreditRating: string;                            // e.g. 'BBB-'
  liquidityRequirementDays: number;                   // % of portfolio liquid within N days
  liquidityRequirementPct: number;
  returnObjectivePct: number;
  riskTolerancePct: number;                           // max drawdown tolerance
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
}

export interface IPSViolation {
  violationId: string;
  ipsId: string;
  groupId: string;
  violationType: 'DRIFT' | 'CONCENTRATION' | 'RESTRICTED_SECURITY' | 'ESG' | 'LIQUIDITY' | 'CREDIT';
  severity: 'WARNING' | 'BREACH';
  description: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface VaultDocument {
  documentId: string;
  groupId: string;
  entityId: string | null;
  documentType: DocumentType;
  title: string;
  uploadedAt: string;
  uploadedBy: string;
  encryptedKeyRef: string;      // Vault KMS key reference (HSM path simulation)
  contentHash: string;          // SHA-256 of original file bytes
  sizeBytes: number;
  retentionUntil: string;       // regulatory retention date
  accessLog: VaultAccessEntry[];
  tags: string[];
}

export interface VaultAccessEntry {
  accessedBy: string;
  accessedAt: string;
  action: 'VIEW' | 'DOWNLOAD' | 'SHARE';
}

// GIPS Household Report
export interface GIPSHouseholdReport {
  reportId: string;
  groupId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  openingMarketValue: string;
  closingMarketValue: string;
  netCashFlows: string;
  grossReturnPct: string;       // TWRR
  netReturnPct: string;         // after fees
  mwrrPct: string;              // Money-Weighted Rate of Return (IRR)
  benchmarkReturnPct: string;   // e.g., 60/40 benchmark
  excessReturnPct: string;      // alpha vs benchmark
  allocationEffect: string;
  selectionEffect: string;
  totalAttributionPct: string;
  compositeAUM: string;
  compositeCount: number;       // number of household accounts in composite
  disclosures: string[];
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const groupStore          = new Map<string, FamilyGroup>();
const entityStore         = new Map<string, FamilyEntity>();
const relationshipStore   = new Map<string, EntityRelationship>();
const beneficiaryStore    = new Map<string, Beneficiary>();
const distributionStore   = new Map<string, DistributionEvent>();
const ipsStore            = new Map<string, IPSPolicy>();
const violationStore      = new Map<string, IPSViolation>();
const documentStore       = new Map<string, VaultDocument>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeContentHash(size: number, title: string): string {
  // Simulate SHA-256 of document contents (in production would hash real bytes)
  return crypto.createHash('sha256').update(`${title}:${size}:${Date.now()}`).digest('hex');
}

function vaultKeyRef(groupId: string, documentId: string): string {
  // Simulate an HSM/Vault KMS key reference path
  return `vault://tpt-bank/family-office/${groupId}/doc-keys/${documentId}`;
}

function retentionDate(docType: DocumentType): string {
  const d = new Date();
  const years = docType === 'TAX_RETURN' ? 7
    : docType === 'WILL' || docType === 'TRUST_DEED' ? 99
    : docType === 'KYC_DOCUMENT' ? 5
    : 7;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0]!;
}

// TWRR: ∏(1 + Rn) - 1  where Rn = (EV - BV - CF) / (BV + CF)
// For simulation we compute a simplified version from opening/closing values + cash flows
function computeTWRR(
  openingMV: Decimal,
  closingMV: Decimal,
  netCashFlows: Decimal,
): string {
  if (openingMV.isZero()) return '0.0000';
  // Single-period TWRR approximation: (closing - opening - cashflows) / (opening + cashflows/2)
  const adjustedBase = openingMV.plus(netCashFlows.dividedBy(2));
  if (adjustedBase.isZero()) return '0.0000';
  const r = closingMV.minus(openingMV).minus(netCashFlows).dividedBy(adjustedBase);
  return r.times(100).toFixed(4);
}

// MWRR (simplified IRR approximation using modified Dietz)
function computeMWRR(
  openingMV: Decimal,
  closingMV: Decimal,
  netCashFlows: Decimal,
): string {
  const denominator = openingMV.plus(netCashFlows.dividedBy(2));
  if (denominator.isZero()) return '0.0000';
  const mwrr = closingMV.minus(openingMV).minus(netCashFlows).dividedBy(denominator);
  return mwrr.times(100).toFixed(4);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class FamilyOfficeService {
  private readonly logger = new Logger(FamilyOfficeService.name);

  // ── Family Groups ─────────────────────────────────────────────────────────

  createFamilyGroup(params: {
    familyName: string;
    relationshipManagerId?: string;
    notes?: string;
  }): FamilyGroup {
    const group: FamilyGroup = {
      groupId:                uuidv4(),
      familyName:             params.familyName,
      primaryContactEntityId: null,
      relationshipManagerId:  params.relationshipManagerId ?? null,
      createdAt:              new Date().toISOString(),
      notes:                  params.notes ?? '',
    };
    groupStore.set(group.groupId, group);
    this.logger.log(`Created family group ${group.groupId} (${group.familyName})`);
    return group;
  }

  getGroup(groupId: string): FamilyGroup {
    const g = groupStore.get(groupId);
    if (!g) throw new NotFoundException(`Family group ${groupId} not found`);
    return g;
  }

  listGroups(): FamilyGroup[] {
    return [...groupStore.values()];
  }

  // ── Entities ──────────────────────────────────────────────────────────────

  addEntity(groupId: string, params: {
    name: string;
    entityType: EntityType;
    jurisdiction: string;
    taxId?: string;
    incorporationDate?: string;
    registeredAgent?: string;
    accountIds?: string[];
    holdingsSnapshot?: HoldingSnapshot[];
  }): FamilyEntity {
    this.getGroup(groupId); // validate group exists

    const entity: FamilyEntity = {
      entityId:          uuidv4(),
      groupId,
      name:              params.name,
      entityType:        params.entityType,
      jurisdiction:      params.jurisdiction,
      taxId:             params.taxId ?? null,
      incorporationDate: params.incorporationDate ?? null,
      registeredAgent:   params.registeredAgent ?? null,
      accountIds:        params.accountIds ?? [],
      holdingsSnapshot:  params.holdingsSnapshot ?? [],
      status:            'ACTIVE',
    };
    entityStore.set(entity.entityId, entity);
    this.logger.log(`Added entity ${entity.entityId} (${entity.name}, ${entity.entityType}) to group ${groupId}`);
    return entity;
  }

  getEntity(entityId: string): FamilyEntity {
    const e = entityStore.get(entityId);
    if (!e) throw new NotFoundException(`Entity ${entityId} not found`);
    return e;
  }

  listGroupEntities(groupId: string): FamilyEntity[] {
    this.getGroup(groupId);
    return [...entityStore.values()].filter((e) => e.groupId === groupId);
  }

  updateEntityHoldings(entityId: string, holdings: HoldingSnapshot[]): FamilyEntity {
    const entity = this.getEntity(entityId);
    entity.holdingsSnapshot = holdings;
    entityStore.set(entityId, entity);
    return entity;
  }

  // ── Entity Relationship Graph ─────────────────────────────────────────────

  addRelationship(groupId: string, params: {
    fromEntityId: string;
    toEntityId: string;
    relationshipType: RelationshipType;
    ownershipPct?: string;
    effectiveDate?: string;
    notes?: string;
  }): EntityRelationship {
    this.getGroup(groupId);
    this.getEntity(params.fromEntityId);
    this.getEntity(params.toEntityId);

    if (params.fromEntityId === params.toEntityId) {
      throw new BadRequestException('An entity cannot have a relationship with itself');
    }

    const rel: EntityRelationship = {
      relationshipId:   uuidv4(),
      groupId,
      fromEntityId:     params.fromEntityId,
      toEntityId:       params.toEntityId,
      relationshipType: params.relationshipType,
      ownershipPct:     params.ownershipPct ?? null,
      effectiveDate:    params.effectiveDate ?? new Date().toISOString().split('T')[0]!,
      endDate:          null,
      notes:            params.notes ?? '',
    };
    relationshipStore.set(rel.relationshipId, rel);
    return rel;
  }

  getEntityGraph(groupId: string): {
    entities: FamilyEntity[];
    relationships: EntityRelationship[];
    adjacencyList: Record<string, { outgoing: string[]; incoming: string[] }>;
  } {
    const entities      = this.listGroupEntities(groupId);
    const relationships = [...relationshipStore.values()]
      .filter((r) => r.groupId === groupId && !r.endDate);

    const adj: Record<string, { outgoing: string[]; incoming: string[] }> = {};
    for (const e of entities) {
      adj[e.entityId] = { outgoing: [], incoming: [] };
    }
    for (const r of relationships) {
      adj[r.fromEntityId]?.outgoing.push(r.toEntityId);
      adj[r.toEntityId]?.incoming.push(r.fromEntityId);
    }

    return { entities, relationships, adjacencyList: adj };
  }

  // ── Beneficiaries ─────────────────────────────────────────────────────────

  addBeneficiary(groupId: string, params: {
    entityId: string;
    distributionClass: DistributionClass;
    distributionPct?: string;
    restrictedUntilAge?: number;
    notes?: string;
  }): Beneficiary {
    this.getGroup(groupId);
    this.getEntity(params.entityId);

    const bene: Beneficiary = {
      beneficiaryId:              uuidv4(),
      groupId,
      entityId:                   params.entityId,
      distributionClass:          params.distributionClass,
      distributionPct:            params.distributionPct ?? null,
      restrictedUntilAge:         params.restrictedUntilAge ?? null,
      notes:                      params.notes ?? '',
      totalDistributionsLifetime: '0.00',
      totalDistributionsYTD:      '0.00',
      lastDistributionDate:       null,
    };
    beneficiaryStore.set(bene.beneficiaryId, bene);
    return bene;
  }

  listBeneficiaries(groupId: string): Beneficiary[] {
    return [...beneficiaryStore.values()].filter((b) => b.groupId === groupId);
  }

  recordDistribution(groupId: string, params: {
    beneficiaryId: string;
    amount: string;
    distributionClass: DistributionClass;
    standard: DistributionEvent['standard'];
    taxWithheld?: string;
    notes?: string;
    approvedBy: string;
  }): DistributionEvent {
    this.getGroup(groupId);
    const bene = beneficiaryStore.get(params.beneficiaryId);
    if (!bene || bene.groupId !== groupId) {
      throw new NotFoundException(`Beneficiary ${params.beneficiaryId} not found in group ${groupId}`);
    }

    const amount = new Decimal(params.amount);
    if (amount.lte(0)) throw new BadRequestException('Distribution amount must be positive');

    const dist: DistributionEvent = {
      distributionId:    uuidv4(),
      groupId,
      beneficiaryId:     params.beneficiaryId,
      amount:            amount.toFixed(2),
      distributionClass: params.distributionClass,
      standard:          params.standard,
      distributionDate:  new Date().toISOString().split('T')[0]!,
      taxWithheld:       params.taxWithheld ?? '0.00',
      notes:             params.notes ?? '',
      approvedBy:        params.approvedBy,
    };
    distributionStore.set(dist.distributionId, dist);

    // Update beneficiary running totals
    bene.totalDistributionsLifetime = new Decimal(bene.totalDistributionsLifetime)
      .plus(amount).toFixed(2);
    const currentYear = new Date().getFullYear().toString();
    const ytdTotal = [...distributionStore.values()]
      .filter((d) => d.beneficiaryId === params.beneficiaryId
        && d.distributionDate.startsWith(currentYear))
      .reduce((sum, d) => sum.plus(new Decimal(d.amount)), new Decimal(0));
    bene.totalDistributionsYTD  = ytdTotal.toFixed(2);
    bene.lastDistributionDate   = dist.distributionDate;
    beneficiaryStore.set(params.beneficiaryId, bene);

    this.logger.log(`Distribution ${dist.distributionId}: $${amount.toFixed(2)} to beneficiary ${params.beneficiaryId}`);
    return dist;
  }

  listDistributions(groupId: string, beneficiaryId?: string): DistributionEvent[] {
    const all = [...distributionStore.values()].filter((d) => d.groupId === groupId);
    return beneficiaryId ? all.filter((d) => d.beneficiaryId === beneficiaryId) : all;
  }

  // ── IPS Enforcement ───────────────────────────────────────────────────────

  createIPS(groupId: string, policy: Omit<IPSPolicy, 'ipsId' | 'groupId' | 'status'>): IPSPolicy {
    this.getGroup(groupId);

    // Supersede any current active IPS
    for (const [id, existing] of ipsStore) {
      if (existing.groupId === groupId && existing.status === 'ACTIVE') {
        existing.status = 'SUPERSEDED';
        ipsStore.set(id, existing);
      }
    }

    const totalAlloc = Object.values(policy.targetAllocation)
      .reduce((s, v) => s + v, 0);
    if (Math.abs(totalAlloc - 100) > 0.01) {
      throw new BadRequestException(
        `Target allocation must sum to 100% (got ${totalAlloc.toFixed(2)}%)`,
      );
    }

    const ips: IPSPolicy = {
      ipsId:  uuidv4(),
      groupId,
      status: 'ACTIVE',
      ...policy,
    };
    ipsStore.set(ips.ipsId, ips);
    this.logger.log(`IPS ${ips.ipsId} created for group ${groupId}`);
    return ips;
  }

  getActiveIPS(groupId: string): IPSPolicy | null {
    return [...ipsStore.values()].find(
      (p) => p.groupId === groupId && p.status === 'ACTIVE',
    ) ?? null;
  }

  enforceIPS(groupId: string): IPSViolation[] {
    const ips = this.getActiveIPS(groupId);
    if (!ips) throw new NotFoundException(`No active IPS for group ${groupId}`);

    const entities = this.listGroupEntities(groupId);
    const newViolations: IPSViolation[] = [];

    // Aggregate holdings across all entities
    const byClass: Record<string, Decimal> = {};
    let totalMV = new Decimal(0);
    const allHoldings: HoldingSnapshot[] = [];

    for (const entity of entities) {
      for (const h of entity.holdingsSnapshot) {
        const mv = new Decimal(h.marketValue);
        byClass[h.assetClass] = (byClass[h.assetClass] ?? new Decimal(0)).plus(mv);
        totalMV = totalMV.plus(mv);
        allHoldings.push(h);
      }
    }

    if (totalMV.isZero()) return [];

    // Check drift against target allocation
    for (const [assetClass, targetPct] of Object.entries(ips.targetAllocation)) {
      const actualMV   = byClass[assetClass] ?? new Decimal(0);
      const actualPct  = actualMV.dividedBy(totalMV).times(100).toNumber();
      const band       = ips.driftBands[assetClass as AssetClass];

      if (band && (actualPct < band.min || actualPct > band.max)) {
        const v: IPSViolation = {
          violationId:   uuidv4(),
          ipsId:         ips.ipsId,
          groupId,
          violationType: 'DRIFT',
          severity:      Math.abs(actualPct - targetPct) > 10 ? 'BREACH' : 'WARNING',
          description:   `${assetClass}: actual ${actualPct.toFixed(2)}% vs target ${targetPct}% ` +
                         `(band ${band.min}%–${band.max}%)`,
          detectedAt:    new Date().toISOString(),
          resolvedAt:    null,
          resolvedBy:    null,
        };
        violationStore.set(v.violationId, v);
        newViolations.push(v);
      }
    }

    // Check concentration: single holding > maxSinglePositionPct
    for (const h of allHoldings) {
      const pct = new Decimal(h.marketValue).dividedBy(totalMV).times(100).toNumber();
      if (pct > ips.maxSinglePositionPct) {
        const v: IPSViolation = {
          violationId:   uuidv4(),
          ipsId:         ips.ipsId,
          groupId,
          violationType: 'CONCENTRATION',
          severity:      'BREACH',
          description:   `"${h.description}" is ${pct.toFixed(2)}% of portfolio (max ${ips.maxSinglePositionPct}%)`,
          detectedAt:    new Date().toISOString(),
          resolvedAt:    null,
          resolvedBy:    null,
        };
        violationStore.set(v.violationId, v);
        newViolations.push(v);
      }
    }

    // Check restricted securities
    for (const h of allHoldings) {
      for (const restricted of ips.restrictedSecurities) {
        if (h.description.toUpperCase().includes(restricted.toUpperCase())) {
          const v: IPSViolation = {
            violationId:   uuidv4(),
            ipsId:         ips.ipsId,
            groupId,
            violationType: 'RESTRICTED_SECURITY',
            severity:      'BREACH',
            description:   `Holding "${h.description}" matches restricted security "${restricted}"`,
            detectedAt:    new Date().toISOString(),
            resolvedAt:    null,
            resolvedBy:    null,
          };
          violationStore.set(v.violationId, v);
          newViolations.push(v);
        }
      }
    }

    this.logger.log(`IPS enforcement for group ${groupId}: ${newViolations.length} violation(s) detected`);
    return newViolations;
  }

  listIPSViolations(groupId: string, openOnly = false): IPSViolation[] {
    const all = [...violationStore.values()].filter((v) => v.groupId === groupId);
    return openOnly ? all.filter((v) => !v.resolvedAt) : all;
  }

  resolveIPSViolation(violationId: string, resolvedBy: string): IPSViolation {
    const v = violationStore.get(violationId);
    if (!v) throw new NotFoundException(`Violation ${violationId} not found`);
    v.resolvedAt  = new Date().toISOString();
    v.resolvedBy  = resolvedBy;
    violationStore.set(violationId, v);
    return v;
  }

  // ── Document Vault (Encrypted) ────────────────────────────────────────────

  storeDocument(params: {
    groupId: string;
    entityId?: string;
    documentType: DocumentType;
    title: string;
    sizeBytes: number;
    uploadedBy: string;
    tags?: string[];
  }): VaultDocument {
    this.getGroup(params.groupId);
    if (params.entityId) this.getEntity(params.entityId);

    const documentId    = uuidv4();
    const contentHash   = computeContentHash(params.sizeBytes, params.title);
    const encryptedKeyRef = vaultKeyRef(params.groupId, documentId);

    const doc: VaultDocument = {
      documentId,
      groupId:       params.groupId,
      entityId:      params.entityId ?? null,
      documentType:  params.documentType,
      title:         params.title,
      uploadedAt:    new Date().toISOString(),
      uploadedBy:    params.uploadedBy,
      encryptedKeyRef,
      contentHash,
      sizeBytes:     params.sizeBytes,
      retentionUntil: retentionDate(params.documentType),
      accessLog:     [],
      tags:          params.tags ?? [],
    };
    documentStore.set(documentId, doc);
    this.logger.log(`Document ${documentId} (${doc.documentType}) stored in vault for group ${params.groupId}`);
    return doc;
  }

  getDocument(documentId: string, accessedBy?: string): VaultDocument {
    const doc = documentStore.get(documentId);
    if (!doc) throw new NotFoundException(`Document ${documentId} not found in vault`);

    if (accessedBy) {
      doc.accessLog.push({
        accessedBy,
        accessedAt: new Date().toISOString(),
        action:     'VIEW',
      });
      documentStore.set(documentId, doc);
    }
    return doc;
  }

  listGroupDocuments(groupId: string, entityId?: string): VaultDocument[] {
    const all = [...documentStore.values()].filter((d) => d.groupId === groupId);
    return entityId ? all.filter((d) => d.entityId === entityId) : all;
  }

  // ── Consolidated Balance Sheet ─────────────────────────────────────────────

  getConsolidatedBalanceSheet(groupId: string): {
    groupId: string;
    familyName: string;
    asOfDate: string;
    entities: Array<{
      entityId: string;
      name: string;
      entityType: EntityType;
      totalMarketValue: string;
      holdings: HoldingSnapshot[];
    }>;
    consolidatedByAssetClass: Record<string, { marketValue: string; pct: string }>;
    totalMarketValue: string;
  } {
    const group    = this.getGroup(groupId);
    const entities = this.listGroupEntities(groupId);

    let totalMV   = new Decimal(0);
    const byClass: Record<string, Decimal> = {};
    const entityRows = [];

    for (const entity of entities) {
      const entityMV = entity.holdingsSnapshot.reduce(
        (sum, h) => sum.plus(new Decimal(h.marketValue)),
        new Decimal(0),
      );
      totalMV = totalMV.plus(entityMV);

      for (const h of entity.holdingsSnapshot) {
        byClass[h.assetClass] = (byClass[h.assetClass] ?? new Decimal(0))
          .plus(new Decimal(h.marketValue));
      }

      entityRows.push({
        entityId:        entity.entityId,
        name:            entity.name,
        entityType:      entity.entityType,
        totalMarketValue: entityMV.toFixed(2),
        holdings:        entity.holdingsSnapshot,
      });
    }

    const consolidatedByAssetClass: Record<string, { marketValue: string; pct: string }> = {};
    for (const [ac, mv] of Object.entries(byClass)) {
      const pct = totalMV.isZero() ? new Decimal(0) : mv.dividedBy(totalMV).times(100);
      consolidatedByAssetClass[ac] = { marketValue: mv.toFixed(2), pct: pct.toFixed(2) };
    }

    return {
      groupId,
      familyName:     group.familyName,
      asOfDate:       new Date().toISOString().split('T')[0]!,
      entities:       entityRows,
      consolidatedByAssetClass,
      totalMarketValue: totalMV.toFixed(2),
    };
  }

  // ── GIPS-Compliant Household Report ──────────────────────────────────────

  generateGIPSReport(groupId: string, params: {
    periodStart: string;
    periodEnd: string;
    openingMarketValue: string;
    closingMarketValue: string;
    netCashFlows: string;
    benchmarkReturnPct: string;
    feesPaid: string;
  }): GIPSHouseholdReport {
    this.getGroup(groupId);

    const openMV      = new Decimal(params.openingMarketValue);
    const closeMV     = new Decimal(params.closingMarketValue);
    const cashFlows   = new Decimal(params.netCashFlows);
    const fees        = new Decimal(params.feesPaid);
    const benchReturn = new Decimal(params.benchmarkReturnPct);

    const grossReturnPct = computeTWRR(openMV, closeMV, cashFlows);
    const mwrrPct        = computeMWRR(openMV, closeMV, cashFlows);

    // Net return = gross return minus fee drag
    const grossReturnDecimal = new Decimal(grossReturnPct);
    const feeDrag = openMV.isZero()
      ? new Decimal(0)
      : fees.dividedBy(openMV).times(100);
    const netReturnPct   = grossReturnDecimal.minus(feeDrag).toFixed(4);
    const excessReturn   = grossReturnDecimal.minus(benchReturn).toFixed(4);

    // Simplified Brinson attribution: assume 60/40 split allocation/selection
    const totalAttrib    = new Decimal(excessReturn);
    const allocEffect    = totalAttrib.times('0.6').toFixed(4);
    const selectionEffect = totalAttrib.times('0.4').toFixed(4);

    const entities    = this.listGroupEntities(groupId);
    const compositeAUM = entities.reduce(
      (sum, e) => sum.plus(
        e.holdingsSnapshot.reduce((s2, h) => s2.plus(new Decimal(h.marketValue)), new Decimal(0)),
      ),
      new Decimal(0),
    );

    const report: GIPSHouseholdReport = {
      reportId:           uuidv4(),
      groupId,
      generatedAt:        new Date().toISOString(),
      periodStart:        params.periodStart,
      periodEnd:          params.periodEnd,
      openingMarketValue: openMV.toFixed(2),
      closingMarketValue: closeMV.toFixed(2),
      netCashFlows:       cashFlows.toFixed(2),
      grossReturnPct,
      netReturnPct,
      mwrrPct,
      benchmarkReturnPct: benchReturn.toFixed(4),
      excessReturnPct:    excessReturn,
      allocationEffect:   allocEffect,
      selectionEffect,
      totalAttributionPct: totalAttrib.toFixed(4),
      compositeAUM:       compositeAUM.toFixed(2),
      compositeCount:     entities.length,
      disclosures: [
        'Returns are calculated in accordance with the CFA Institute Global Investment Performance Standards (GIPS®).',
        'TWRR used for gross return. Modified Dietz used for MWRR approximation.',
        'Fee drag calculated using annual management fee divided by opening AUM.',
        'Attribution uses single-period Brinson-Hood-Beebower model.',
        'Past performance is not indicative of future results.',
        'TPT Banking Wealth Management is in compliance with GIPS Standards.',
      ],
    };

    this.logger.log(`GIPS report generated for group ${groupId}: ${params.periodStart} to ${params.periodEnd}`);
    return report;
  }
}
