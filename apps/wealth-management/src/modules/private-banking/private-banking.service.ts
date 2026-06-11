import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type WealthTier = 'MASS_AFFLUENT' | 'HNW' | 'VHNW' | 'UHNW';
export type ServiceLevel = 'PREMIUM' | 'ELITE' | 'ULTRA';
export type ConciergeRequestType =
  | 'TRAVEL'
  | 'AIRPORT_LOUNGE'
  | 'EVENT_ACCESS'
  | 'DINING_RESERVATION'
  | 'INVESTMENT_ADVISORY'
  | 'TAX_CONSULTATION'
  | 'LEGAL_REFERRAL'
  | 'PHILANTHROPY'
  | 'ART_ADVISORY'
  | 'REAL_ESTATE'
  | 'GENERAL';
export type ConciergeRequestStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';

export interface FeeSchedule {
  aumFeeAnnualPct: string;       // e.g. "0.85" = 0.85% p.a.
  minimumAnnualFee: string;      // USD
  transactionFee: string;        // per transaction USD
  trusteeServiceFee: string;     // annual USD
  privateEquityCarry: string;    // carried interest pct for PE mandates
}

export interface PrivateBankingClient {
  clientId: string;
  customerId: string;
  tier: WealthTier;
  serviceLevel: ServiceLevel;
  aum: string;                   // USD, string via Decimal
  rmId: string | null;
  feeSchedule: FeeSchedule;
  conciergeAccess: boolean;
  privateEventAccess: boolean;
  dedicatedPhoneLine: string | null;
  onboardedAt: string;
  lastReviewDate: string | null;
  nextReviewDate: string;
  notes: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

export interface RelationshipManager {
  rmId: string;
  name: string;
  email: string;
  phone: string;
  specializations: string[];     // e.g. ['EQUITIES', 'ALTERNATIVES', 'REAL_ESTATE']
  currentClientCount: number;
  maxClientCount: number;        // capacity limit
  totalAumManaged: string;       // USD
  preferredTiers: WealthTier[];
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
}

export interface ConciergeRequest {
  requestId: string;
  clientId: string;
  type: ConciergeRequestType;
  description: string;
  status: ConciergeRequestStatus;
  priority: 'ROUTINE' | 'URGENT' | 'CRITICAL';
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

// ── Tier thresholds (AUM in USD millions) ─────────────────────────────────────

const TIER_THRESHOLDS = {
  MASS_AFFLUENT: new Decimal('500000'),    // $500K
  HNW:           new Decimal('1000000'),   // $1M
  VHNW:          new Decimal('5000000'),   // $5M
  UHNW:          new Decimal('25000000'),  // $25M
};

const FEE_SCHEDULES: Record<WealthTier, FeeSchedule> = {
  MASS_AFFLUENT: {
    aumFeeAnnualPct:   '1.00',
    minimumAnnualFee:  '2500',
    transactionFee:    '25',
    trusteeServiceFee: '0',
    privateEquityCarry: '0',
  },
  HNW: {
    aumFeeAnnualPct:   '0.85',
    minimumAnnualFee:  '5000',
    transactionFee:    '15',
    trusteeServiceFee: '2500',
    privateEquityCarry: '0',
  },
  VHNW: {
    aumFeeAnnualPct:   '0.65',
    minimumAnnualFee:  '10000',
    transactionFee:    '10',
    trusteeServiceFee: '5000',
    privateEquityCarry: '10',
  },
  UHNW: {
    aumFeeAnnualPct:   '0.50',
    minimumAnnualFee:  '25000',
    transactionFee:    '0',    // zero-commission for UHNW
    trusteeServiceFee: '10000',
    privateEquityCarry: '20',
  },
};

function classifyTier(aum: Decimal): WealthTier {
  if (aum.gte(TIER_THRESHOLDS.UHNW)) return 'UHNW';
  if (aum.gte(TIER_THRESHOLDS.VHNW)) return 'VHNW';
  if (aum.gte(TIER_THRESHOLDS.HNW))  return 'HNW';
  return 'MASS_AFFLUENT';
}

function serviceLevel(tier: WealthTier): ServiceLevel {
  if (tier === 'UHNW')         return 'ULTRA';
  if (tier === 'VHNW')         return 'ELITE';
  return 'PREMIUM';
}

function nextReviewDate(tier: WealthTier): string {
  const d = new Date();
  // UHNW quarterly, VHNW semi-annual, HNW annual, MASS_AFFLUENT annual
  const monthsOut = tier === 'UHNW' ? 3 : tier === 'VHNW' ? 6 : 12;
  d.setMonth(d.getMonth() + monthsOut);
  return d.toISOString().split('T')[0]!;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const clientStore = new Map<string, PrivateBankingClient>();
const rmStore     = new Map<string, RelationshipManager>();
const conciergeStore = new Map<string, ConciergeRequest>();

// Seed a few relationship managers
const SEED_RMS: RelationshipManager[] = [
  {
    rmId: 'rm-001',
    name: 'Alexandra Chen',
    email: 'a.chen@tptbank.com',
    phone: '+1-212-555-0101',
    specializations: ['EQUITIES', 'ALTERNATIVES', 'HEDGE_FUNDS'],
    currentClientCount: 0,
    maxClientCount: 15,
    totalAumManaged: '0',
    preferredTiers: ['UHNW', 'VHNW'],
    status: 'ACTIVE',
  },
  {
    rmId: 'rm-002',
    name: 'James Whitfield',
    email: 'j.whitfield@tptbank.com',
    phone: '+1-212-555-0102',
    specializations: ['FIXED_INCOME', 'REAL_ESTATE', 'TRUSTS'],
    currentClientCount: 0,
    maxClientCount: 20,
    totalAumManaged: '0',
    preferredTiers: ['VHNW', 'HNW'],
    status: 'ACTIVE',
  },
  {
    rmId: 'rm-003',
    name: 'Priya Sharma',
    email: 'p.sharma@tptbank.com',
    phone: '+1-212-555-0103',
    specializations: ['EQUITIES', 'PHILANTHROPY', 'IMPACT_INVESTING'],
    currentClientCount: 0,
    maxClientCount: 25,
    totalAumManaged: '0',
    preferredTiers: ['HNW', 'MASS_AFFLUENT'],
    status: 'ACTIVE',
  },
];

for (const rm of SEED_RMS) {
  rmStore.set(rm.rmId, rm);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PrivateBankingService {
  private readonly logger = new Logger(PrivateBankingService.name);

  // ── Client onboarding ──────────────────────────────────────────────────────

  onboardClient(params: {
    customerId: string;
    aum: string;
    notes?: string;
  }): PrivateBankingClient {
    const existing = [...clientStore.values()].find((c) => c.customerId === params.customerId);
    if (existing) {
      throw new ConflictException(`Customer ${params.customerId} is already a private banking client (${existing.clientId})`);
    }

    const aumDecimal = new Decimal(params.aum);
    if (aumDecimal.lte(0)) {
      throw new BadRequestException('AUM must be positive');
    }

    const tier = classifyTier(aumDecimal);
    const svc  = serviceLevel(tier);

    const client: PrivateBankingClient = {
      clientId:            uuidv4(),
      customerId:          params.customerId,
      tier,
      serviceLevel:        svc,
      aum:                 aumDecimal.toFixed(2),
      rmId:                null,
      feeSchedule:         FEE_SCHEDULES[tier],
      conciergeAccess:     svc !== 'PREMIUM',
      privateEventAccess:  svc === 'ULTRA',
      dedicatedPhoneLine:  svc !== 'PREMIUM' ? `+1-800-555-${Math.floor(1000 + Math.random() * 9000)}` : null,
      onboardedAt:         new Date().toISOString(),
      lastReviewDate:      null,
      nextReviewDate:      nextReviewDate(tier),
      notes:               params.notes ?? '',
      status:              'ACTIVE',
    };

    clientStore.set(client.clientId, client);
    this.logger.log(`Onboarded private banking client ${client.clientId} (${tier}, AUM ${aumDecimal.toFixed(0)})`);
    return client;
  }

  // ── AUM update + tier recalculation ───────────────────────────────────────

  updateAUM(clientId: string, newAUM: string): PrivateBankingClient {
    const client = this.getClient(clientId);
    const aumDecimal = new Decimal(newAUM);
    if (aumDecimal.lte(0)) throw new BadRequestException('AUM must be positive');

    const oldTier = client.tier;
    const newTier = classifyTier(aumDecimal);
    const svc     = serviceLevel(newTier);

    client.aum            = aumDecimal.toFixed(2);
    client.tier           = newTier;
    client.serviceLevel   = svc;
    client.feeSchedule    = FEE_SCHEDULES[newTier];
    client.conciergeAccess     = svc !== 'PREMIUM';
    client.privateEventAccess  = svc === 'ULTRA';
    client.nextReviewDate      = nextReviewDate(newTier);

    clientStore.set(clientId, client);

    if (oldTier !== newTier) {
      this.logger.log(`Client ${clientId} tier changed ${oldTier} → ${newTier} (AUM ${aumDecimal.toFixed(0)})`);
    }
    return client;
  }

  // ── RM assignment ──────────────────────────────────────────────────────────

  assignRM(clientId: string, rmId: string): PrivateBankingClient {
    const client = this.getClient(clientId);
    const rm = this.getRM(rmId);

    if (rm.status !== 'ACTIVE') {
      throw new BadRequestException(`RM ${rmId} is not active (status: ${rm.status})`);
    }
    if (rm.currentClientCount >= rm.maxClientCount) {
      throw new BadRequestException(`RM ${rmId} is at capacity (${rm.currentClientCount}/${rm.maxClientCount} clients)`);
    }

    // Release from old RM
    if (client.rmId && client.rmId !== rmId) {
      const oldRm = rmStore.get(client.rmId);
      if (oldRm) {
        oldRm.currentClientCount = Math.max(0, oldRm.currentClientCount - 1);
        oldRm.totalAumManaged = new Decimal(oldRm.totalAumManaged)
          .minus(new Decimal(client.aum))
          .toFixed(2);
        rmStore.set(client.rmId, oldRm);
      }
    }

    if (client.rmId !== rmId) {
      rm.currentClientCount++;
      rm.totalAumManaged = new Decimal(rm.totalAumManaged)
        .plus(new Decimal(client.aum))
        .toFixed(2);
      rmStore.set(rmId, rm);
    }

    client.rmId = rmId;
    clientStore.set(clientId, client);
    this.logger.log(`Assigned RM ${rmId} (${rm.name}) to client ${clientId}`);
    return client;
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  getClient(clientId: string): PrivateBankingClient {
    const client = clientStore.get(clientId);
    if (!client) throw new NotFoundException(`Private banking client ${clientId} not found`);
    return client;
  }

  listClients(tier?: WealthTier): PrivateBankingClient[] {
    const all = [...clientStore.values()].filter((c) => c.status === 'ACTIVE');
    return tier ? all.filter((c) => c.tier === tier) : all;
  }

  getRM(rmId: string): RelationshipManager {
    const rm = rmStore.get(rmId);
    if (!rm) throw new NotFoundException(`Relationship manager ${rmId} not found`);
    return rm;
  }

  listRMs(): RelationshipManager[] {
    return [...rmStore.values()];
  }

  addRM(params: {
    name: string;
    email: string;
    phone: string;
    specializations: string[];
    maxClientCount: number;
    preferredTiers: WealthTier[];
  }): RelationshipManager {
    const rm: RelationshipManager = {
      rmId: `rm-${uuidv4().substring(0, 8)}`,
      name: params.name,
      email: params.email,
      phone: params.phone,
      specializations: params.specializations,
      currentClientCount: 0,
      maxClientCount: params.maxClientCount,
      totalAumManaged: '0',
      preferredTiers: params.preferredTiers,
      status: 'ACTIVE',
    };
    rmStore.set(rm.rmId, rm);
    return rm;
  }

  // ── Concierge ─────────────────────────────────────────────────────────────

  createConciergeRequest(params: {
    clientId: string;
    type: ConciergeRequestType;
    description: string;
    priority?: 'ROUTINE' | 'URGENT' | 'CRITICAL';
  }): ConciergeRequest {
    const client = this.getClient(params.clientId);
    if (!client.conciergeAccess) {
      throw new BadRequestException(`Client ${params.clientId} does not have concierge access (tier: ${client.tier})`);
    }

    const req: ConciergeRequest = {
      requestId:       uuidv4(),
      clientId:        params.clientId,
      type:            params.type,
      description:     params.description,
      status:          'OPEN',
      priority:        params.priority ?? 'ROUTINE',
      assignedTo:      client.rmId,
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
      resolvedAt:      null,
      resolutionNotes: null,
    };

    conciergeStore.set(req.requestId, req);
    this.logger.log(`Concierge request ${req.requestId} (${req.type}) created for client ${params.clientId}`);
    return req;
  }

  updateConciergeRequest(requestId: string, params: {
    status?: ConciergeRequestStatus;
    assignedTo?: string;
    resolutionNotes?: string;
  }): ConciergeRequest {
    const req = conciergeStore.get(requestId);
    if (!req) throw new NotFoundException(`Concierge request ${requestId} not found`);

    if (params.status)          req.status = params.status;
    if (params.assignedTo)      req.assignedTo = params.assignedTo;
    if (params.resolutionNotes) req.resolutionNotes = params.resolutionNotes;

    req.updatedAt = new Date().toISOString();
    if (params.status === 'RESOLVED' || params.status === 'CANCELLED') {
      req.resolvedAt = new Date().toISOString();
    }

    conciergeStore.set(requestId, req);
    return req;
  }

  listConciergeRequests(clientId?: string): ConciergeRequest[] {
    const all = [...conciergeStore.values()];
    return clientId ? all.filter((r) => r.clientId === clientId) : all;
  }

  // ── Consolidated summary ──────────────────────────────────────────────────

  getConsolidatedSummary(): {
    totalClients: number;
    byTier: Record<WealthTier, { count: number; totalAUM: string }>;
    totalAUM: string;
    openConciergeRequests: number;
    rmUtilization: Array<{ rmId: string; name: string; clients: number; capacity: number; aum: string }>;
  } {
    const clients = [...clientStore.values()].filter((c) => c.status === 'ACTIVE');

    const byTier: Record<WealthTier, { count: number; totalAUM: Decimal }> = {
      MASS_AFFLUENT: { count: 0, totalAUM: new Decimal(0) },
      HNW:           { count: 0, totalAUM: new Decimal(0) },
      VHNW:          { count: 0, totalAUM: new Decimal(0) },
      UHNW:          { count: 0, totalAUM: new Decimal(0) },
    };

    let totalAUM = new Decimal(0);
    for (const c of clients) {
      byTier[c.tier].count++;
      byTier[c.tier].totalAUM = byTier[c.tier].totalAUM.plus(new Decimal(c.aum));
      totalAUM = totalAUM.plus(new Decimal(c.aum));
    }

    const openConcierge = [...conciergeStore.values()].filter(
      (r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS',
    ).length;

    const rmUtilization = [...rmStore.values()].map((rm) => ({
      rmId:     rm.rmId,
      name:     rm.name,
      clients:  rm.currentClientCount,
      capacity: rm.maxClientCount,
      aum:      rm.totalAumManaged,
    }));

    return {
      totalClients: clients.length,
      byTier: {
        MASS_AFFLUENT: { count: byTier.MASS_AFFLUENT.count, totalAUM: byTier.MASS_AFFLUENT.totalAUM.toFixed(2) },
        HNW:           { count: byTier.HNW.count,           totalAUM: byTier.HNW.totalAUM.toFixed(2) },
        VHNW:          { count: byTier.VHNW.count,          totalAUM: byTier.VHNW.totalAUM.toFixed(2) },
        UHNW:          { count: byTier.UHNW.count,          totalAUM: byTier.UHNW.totalAUM.toFixed(2) },
      },
      totalAUM:              totalAUM.toFixed(2),
      openConciergeRequests: openConcierge,
      rmUtilization,
    };
  }

  // ── Client dashboard ──────────────────────────────────────────────────────

  getClientDashboard(clientId: string): {
    client: PrivateBankingClient;
    rm: RelationshipManager | null;
    openConciergeRequests: ConciergeRequest[];
    annualFeeLiability: string;
    quarterlyFee: string;
  } {
    const client = this.getClient(clientId);
    const rm = client.rmId ? (rmStore.get(client.rmId) ?? null) : null;
    const openRequests = [...conciergeStore.values()].filter(
      (r) => r.clientId === clientId && (r.status === 'OPEN' || r.status === 'IN_PROGRESS'),
    );

    const aumDecimal = new Decimal(client.aum);
    const annualFeeFromAUM = aumDecimal
      .times(new Decimal(client.feeSchedule.aumFeeAnnualPct).dividedBy(100));
    const annualFee = Decimal.max(annualFeeFromAUM, new Decimal(client.feeSchedule.minimumAnnualFee));

    return {
      client,
      rm,
      openConciergeRequests: openRequests,
      annualFeeLiability: annualFee.toFixed(2),
      quarterlyFee:       annualFee.dividedBy(4).toFixed(2),
    };
  }
}
