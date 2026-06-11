import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelationshipType = 'BILATERAL' | 'UNILATERAL';
export type ServiceType =
  | 'USD_CLEARING'
  | 'EUR_CLEARING'
  | 'GBP_CLEARING'
  | 'JPY_CLEARING'
  | 'CHF_CLEARING'
  | 'SWIFT_MESSAGING'
  | 'TRADE_FINANCE'
  | 'FX_SERVICES'
  | 'CUSTODY'
  | 'CASH_MANAGEMENT';

export type MessageType =
  | 'MT103'   // Single customer credit transfer
  | 'MT202'   // General financial institution transfer
  | 'MT202COV'// Cover payment
  | 'MT210'   // Notice to receive
  | 'MT900'   // Confirmation of debit
  | 'MT910'   // Confirmation of credit
  | 'MT940'   // Customer statement
  | 'MT950'   // Statement message
  | 'MT760'   // Guarantee / SBLC
  | 'MT798';  // Trade finance wrapper

export type MessageStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'PENDING_RESPONSE';

export interface CorrespondentBank {
  bankId: string;
  bankName: string;
  bic: string;          // SWIFT BIC (8 or 11 chars)
  leiCode: string;      // Legal Entity Identifier
  country: string;
  city: string;
  relationship: RelationshipType;
  services: ServiceType[];
  creditLimit: number;
  currentExposure: number;
  kycStatus: 'APPROVED' | 'UNDER_REVIEW' | 'EXPIRED' | 'REJECTED';
  kycExpiryDate: string | null;
  nostroAccounts: string[];   // nostro account IDs with this correspondent
  feeSchedule: Record<string, number>;   // messageType → fee in USD
  status: 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED' | 'TERMINATED';
  onboardedDate: string;
}

export interface SwiftMessage {
  messageId: string;
  bankId: string;
  messageType: MessageType;
  direction: 'OUTBOUND' | 'INBOUND';
  senderBIC: string;
  receiverBIC: string;
  relatedReference: string;
  valueDate: string;
  currency: string;
  amount: string;
  status: MessageStatus;
  rawContent: string;       // MT raw field content
  uetr: string;             // Unique end-to-end transaction reference (ISO 20022)
  gpiStatus?: string;       // SWIFT gpi tracking status
  chargeCode: 'SHA' | 'OUR' | 'BEN';
  fee: string;
  createdAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
}

export interface RoutingDecision {
  currency: string;
  amount: number;
  beneficiaryBIC: string;
  selectedCorrespondent: CorrespondentBank | null;
  routingPath: string[];     // BIC chain
  estimatedFee: string;
  estimatedSettlementTime: string;
  alternativeRoutes: Array<{
    correspondent: string;
    fee: string;
    hops: number;
    settlementTime: string;
  }>;
  warnings: string[];
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const bankStore = new Map<string, CorrespondentBank>();
const messageStore = new Map<string, SwiftMessage>();

// ── Currency → primary clearing BIC mapping (simplified network model) ────────
const CLEARING_PREFERENCES: Record<string, string[]> = {
  USD: ['CHASUS33', 'BOFAUS3N', 'CITIUS33'],  // JPMorgan, BofA, Citi
  EUR: ['DEUTDEDB', 'BNPAFRPP', 'SOGEFRPP'],  // Deutsche, BNP, SocGen
  GBP: ['BARCGB22', 'HSBCGB2L', 'LLOYSGB2L'],
  JPY: ['BOTKJPJT', 'MHCBJPJT'],
  CHF: ['UBSWCHZH80A', 'CRESCHZZ80A'],
};

@Injectable()
export class CorrespondentService {
  private readonly logger = new Logger(CorrespondentService.name);

  // ── Bank relationship management ──────────────────────────────────────────

  addCorrespondent(params: Omit<CorrespondentBank, 'bankId' | 'currentExposure' | 'onboardedDate'>): CorrespondentBank {
    if (params.kycStatus !== 'APPROVED') {
      throw new BadRequestException('Cannot add a correspondent whose KYC is not APPROVED');
    }

    const bankId = uuidv4();
    const bank: CorrespondentBank = {
      bankId,
      ...params,
      currentExposure: 0,
      onboardedDate: new Date().toISOString().split('T')[0]!,
    };
    bankStore.set(bankId, bank);
    this.logger.log(`Added correspondent: ${bank.bankName} (${bank.bic})`);
    return bank;
  }

  getCorrespondent(bankId: string): CorrespondentBank {
    const bank = bankStore.get(bankId);
    if (!bank) throw new NotFoundException(`Correspondent bank ${bankId} not found`);
    return bank;
  }

  findByBIC(bic: string): CorrespondentBank | null {
    return [...bankStore.values()].find((b) => b.bic === bic.toUpperCase()) ?? null;
  }

  getAllCorrespondents(filter?: { status?: string; service?: ServiceType; country?: string }): CorrespondentBank[] {
    return [...bankStore.values()].filter((b) => {
      if (filter?.status && b.status !== filter.status) return false;
      if (filter?.service && !b.services.includes(filter.service)) return false;
      if (filter?.country && b.country !== filter.country) return false;
      return true;
    });
  }

  updateKycStatus(bankId: string, status: CorrespondentBank['kycStatus'], expiryDate?: string): CorrespondentBank {
    const bank = this.getCorrespondent(bankId);
    bank.kycStatus = status;
    bank.kycExpiryDate = expiryDate ?? null;
    if (status === 'REJECTED' || status === 'EXPIRED') {
      bank.status = 'RESTRICTED';
    } else if (status === 'APPROVED') {
      bank.status = 'ACTIVE';
    }
    bankStore.set(bankId, bank);
    return bank;
  }

  updateCreditLimit(bankId: string, newLimit: number): CorrespondentBank {
    const bank = this.getCorrespondent(bankId);
    bank.creditLimit = newLimit;
    bankStore.set(bankId, bank);
    return bank;
  }

  // ── SWIFT message creation ─────────────────────────────────────────────────

  createMessage(params: {
    bankId: string;
    messageType: MessageType;
    direction: 'OUTBOUND' | 'INBOUND';
    senderBIC: string;
    receiverBIC: string;
    relatedReference: string;
    valueDate: string;
    currency: string;
    amount: number;
    chargeCode: SwiftMessage['chargeCode'];
    rawContent: string;
  }): SwiftMessage {
    const bank = this.getCorrespondent(params.bankId);

    if (bank.status !== 'ACTIVE') {
      throw new BadRequestException(`Correspondent ${bank.bic} is not ACTIVE (status: ${bank.status})`);
    }
    if (bank.kycStatus !== 'APPROVED') {
      throw new BadRequestException(`Correspondent ${bank.bic} KYC is not approved`);
    }

    // Exposure check for outbound payments
    if (params.direction === 'OUTBOUND' && params.amount > 0) {
      const newExposure = new Decimal(bank.currentExposure).plus(params.amount).toNumber();
      if (newExposure > bank.creditLimit && bank.creditLimit > 0) {
        throw new BadRequestException(
          `Message would breach credit limit: ${newExposure.toFixed(0)} > ${bank.creditLimit.toFixed(0)}`,
        );
      }
    }

    const fee = bank.feeSchedule[params.messageType] ?? 0;
    const message: SwiftMessage = {
      messageId: uuidv4(),
      bankId: params.bankId,
      messageType: params.messageType,
      direction: params.direction,
      senderBIC: params.senderBIC.toUpperCase(),
      receiverBIC: params.receiverBIC.toUpperCase(),
      relatedReference: params.relatedReference,
      valueDate: params.valueDate,
      currency: params.currency.toUpperCase(),
      amount: params.amount.toFixed(2),
      status: 'QUEUED',
      rawContent: params.rawContent,
      uetr: uuidv4(),   // SWIFT gpi UETR
      chargeCode: params.chargeCode,
      fee: fee.toFixed(2),
      createdAt: new Date().toISOString(),
      sentAt: null,
      acknowledgedAt: null,
    };

    messageStore.set(message.messageId, message);
    this.logger.log(`Created ${params.messageType} message: ${message.messageId} → ${params.receiverBIC} for ${params.amount} ${params.currency}`);
    return message;
  }

  sendMessage(messageId: string): SwiftMessage {
    const message = this.getMessage(messageId);
    if (message.status !== 'QUEUED') {
      throw new BadRequestException(`Message ${messageId} is not in QUEUED status`);
    }
    message.status = 'SENT';
    message.sentAt = new Date().toISOString();

    // Update correspondent exposure
    const bank = bankStore.get(message.bankId);
    if (bank && message.direction === 'OUTBOUND') {
      bank.currentExposure = new Decimal(bank.currentExposure).plus(new Decimal(message.amount)).toNumber();
      bankStore.set(bank.bankId, bank);
    }

    messageStore.set(messageId, message);
    return message;
  }

  acknowledgeMessage(messageId: string, gpiStatus?: string): SwiftMessage {
    const message = this.getMessage(messageId);
    message.status = 'ACKNOWLEDGED';
    message.acknowledgedAt = new Date().toISOString();
    if (gpiStatus) message.gpiStatus = gpiStatus;
    messageStore.set(messageId, message);
    return message;
  }

  getMessage(messageId: string): SwiftMessage {
    const msg = messageStore.get(messageId);
    if (!msg) throw new NotFoundException(`Message ${messageId} not found`);
    return msg;
  }

  getMessages(bankId?: string, status?: MessageStatus): SwiftMessage[] {
    return [...messageStore.values()].filter((m) => {
      if (bankId && m.bankId !== bankId) return false;
      if (status && m.status !== status) return false;
      return true;
    });
  }

  // ── Routing intelligence ───────────────────────────────────────────────────

  computeOptimalRoute(params: {
    currency: string;
    amount: number;
    beneficiaryBIC: string;
  }): RoutingDecision {
    const warnings: string[] = [];
    const currency = params.currency.toUpperCase();

    // Find all active correspondents offering this currency clearing
    const serviceMap: Record<string, ServiceType> = {
      USD: 'USD_CLEARING',
      EUR: 'EUR_CLEARING',
      GBP: 'GBP_CLEARING',
      JPY: 'JPY_CLEARING',
      CHF: 'CHF_CLEARING',
    };
    const requiredService = serviceMap[currency];
    const candidates = [...bankStore.values()].filter(
      (b) =>
        b.status === 'ACTIVE' &&
        b.kycStatus === 'APPROVED' &&
        (!requiredService || b.services.includes(requiredService)) &&
        (b.creditLimit === 0 || new Decimal(b.currentExposure).plus(params.amount).lessThanOrEqualTo(b.creditLimit)),
    );

    // Preferred clearing BICs for this currency
    const preferred = CLEARING_PREFERENCES[currency] ?? [];
    candidates.sort((a, b) => {
      const ai = preferred.indexOf(a.bic);
      const bi = preferred.indexOf(b.bic);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      // Fallback: sort by fee
      const aFee = a.feeSchedule['MT202'] ?? a.feeSchedule['MT103'] ?? 999;
      const bFee = b.feeSchedule['MT202'] ?? b.feeSchedule['MT103'] ?? 999;
      return aFee - bFee;
    });

    const selected = candidates[0] ?? null;

    if (!selected) {
      warnings.push(`No active correspondent found for ${currency} clearing. Manual intervention required.`);
    }
    if (params.amount > 1_000_000) {
      warnings.push(`Large value transfer ($${params.amount.toLocaleString()}) — consider RTGS routing and additional scrutiny`);
    }

    const msgType: MessageType = currency === 'USD' && params.amount > 0 ? 'MT202' : 'MT103';
    const fee = selected ? (selected.feeSchedule[msgType] ?? 25) : 0;

    const alternatives = candidates.slice(1, 4).map((b) => ({
      correspondent: `${b.bankName} (${b.bic})`,
      fee: `$${(b.feeSchedule[msgType] ?? 25).toFixed(2)}`,
      hops: 1,
      settlementTime: currency === 'USD' ? 'Same day (Fedwire)' : 'T+1',
    }));

    return {
      currency,
      amount: params.amount,
      beneficiaryBIC: params.beneficiaryBIC.toUpperCase(),
      selectedCorrespondent: selected,
      routingPath: selected
        ? ['OUR_BIC', selected.bic, params.beneficiaryBIC]
        : ['OUR_BIC', params.beneficiaryBIC],
      estimatedFee: `$${fee.toFixed(2)}`,
      estimatedSettlementTime: currency === 'USD' ? 'Same day (Fedwire/CHIPS)' :
                               currency === 'EUR' ? 'Same day (TARGET2)' :
                               currency === 'GBP' ? 'Same day (CHAPS)' :
                               'T+1',
      alternativeRoutes: alternatives,
      warnings,
    };
  }

  // ── Network summary ────────────────────────────────────────────────────────

  getNetworkSummary(): {
    totalCorrespondents: number;
    activeCorrespondents: number;
    kycExpiringSoon: number;    // within 30 days
    totalCreditLimit: string;
    totalCurrentExposure: string;
    utilizationPct: string;
    byCountry: Record<string, number>;
    byService: Record<string, number>;
  } {
    const all = [...bankStore.values()];
    const active = all.filter((b) => b.status === 'ACTIVE');
    const today = new Date();
    const soon = new Date(today);
    soon.setDate(today.getDate() + 30);

    const expiringSoon = all.filter((b) => {
      if (!b.kycExpiryDate) return false;
      const exp = new Date(b.kycExpiryDate);
      return exp <= soon && exp >= today;
    });

    const totalLimit = all.reduce((s, b) => s.plus(b.creditLimit), new Decimal(0));
    const totalExposure = all.reduce((s, b) => s.plus(b.currentExposure), new Decimal(0));

    const byCountry: Record<string, number> = {};
    const byService: Record<string, number> = {};
    for (const b of active) {
      byCountry[b.country] = (byCountry[b.country] ?? 0) + 1;
      for (const svc of b.services) {
        byService[svc] = (byService[svc] ?? 0) + 1;
      }
    }

    const utilization = totalLimit.isZero() ? 0 : totalExposure.dividedBy(totalLimit).times(100).toNumber();

    return {
      totalCorrespondents: all.length,
      activeCorrespondents: active.length,
      kycExpiringSoon: expiringSoon.length,
      totalCreditLimit: totalLimit.toFixed(0),
      totalCurrentExposure: totalExposure.toFixed(0),
      utilizationPct: `${utilization.toFixed(2)}%`,
      byCountry,
      byService,
    };
  }
}
