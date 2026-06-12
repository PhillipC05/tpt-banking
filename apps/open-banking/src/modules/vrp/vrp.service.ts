import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@tpt/shared';
import Decimal from 'decimal.js';
import { PaymentBridgeService } from '../obie/payment-bridge.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VrpType = 'SWEEPING' | 'OTHER';
export type VrpConsentStatus = 'AWAITING_AUTHORISATION' | 'AUTHORISED' | 'REVOKED';
export type VrpPaymentStatus = 'Pending' | 'AcceptedSettlementInProcess' | 'AcceptedSettlementCompleted' | 'Rejected';
export type VrpPeriod = 'Day' | 'Week' | 'Month';

export interface VrpPeriodicLimit {
  period:    VrpPeriod;
  maxAmount: string;
  currency:  string;
}

export interface VrpConsent {
  id:                 string;
  clientId:           string;
  customerId:         string | null;
  status:             VrpConsentStatus;
  vrpType:            VrpType;
  periodicLimits:     VrpPeriodicLimit[];
  validityPeriod:     { fromDateTime: string; toDateTime: string };
  authorisedAccountId: string | null;
  debtorAccount:      { schemeName: string; identification: string } | null;
  createdAt:          Date;
}

export interface VrpPayment {
  id:                   string;
  consentId:            string;
  clientId:             string;
  status:               VrpPaymentStatus;
  amount:               string;
  currency:             string;
  creditorAccount:      Record<string, unknown>;
  bankingCorePaymentId: string | null;
  createdAt:            Date;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const vrpConsentStore  = new Map<string, VrpConsent>();
const vrpPaymentStore  = new Map<string, VrpPayment>();

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class VrpService {
  private readonly logger = new Logger(VrpService.name);

  constructor(
    private readonly paymentBridge: PaymentBridgeService,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  createVrpConsent(params: {
    clientId:       string;
    vrpType:        VrpType;
    periodicLimits: VrpPeriodicLimit[];
    validityPeriod: { fromDateTime: string; toDateTime: string };
    debtorAccount?: { schemeName: string; identification: string };
  }): VrpConsent {
    // Validate all limit amounts via Money constructor
    for (const limit of params.periodicLimits) {
      new Money(limit.maxAmount, limit.currency);
    }

    const consent: VrpConsent = {
      id:                  uuidv4(),
      clientId:            params.clientId,
      customerId:          null,
      status:              'AWAITING_AUTHORISATION',
      vrpType:             params.vrpType,
      periodicLimits:      params.periodicLimits,
      validityPeriod:      params.validityPeriod,
      authorisedAccountId: null,
      debtorAccount:       params.debtorAccount ?? null,
      createdAt:           new Date(),
    };
    vrpConsentStore.set(consent.id, consent);
    return consent;
  }

  getVrpConsent(consentId: string): VrpConsent {
    const consent = vrpConsentStore.get(consentId);
    if (!consent) throw new NotFoundException(`VRP consent ${consentId} not found`);
    return consent;
  }

  deleteVrpConsent(consentId: string): void {
    const consent = this.getVrpConsent(consentId);
    consent.status = 'REVOKED';
    vrpConsentStore.set(consentId, consent);

    void this.webhookDelivery.queueDelivery('consent.revoked', {
      consentId,
      type:      'VRP',
      clientId:  consent.clientId,
      revokedAt: new Date().toISOString(),
    });
  }

  async submitVrpPayment(
    consentId: string,
    params: {
      clientId:        string;
      amount:          string;
      currency:        string;
      creditorAccount: Record<string, unknown>;
      creditorName:    string;
      creditorIban?:   string;
    },
    idempotencyKey: string,
  ): Promise<VrpPayment> {
    const consent = this.getVrpConsent(consentId);

    if (consent.status !== 'AUTHORISED') {
      throw new BadRequestException(`VRP consent ${consentId} is not AUTHORISED`);
    }

    // Check validity period
    const now = new Date();
    if (now < new Date(consent.validityPeriod.fromDateTime)) {
      throw new BadRequestException('VRP consent validity period has not started');
    }
    if (now > new Date(consent.validityPeriod.toDateTime)) {
      throw new BadRequestException('VRP consent validity period has expired');
    }

    const requested = new Money(params.amount, params.currency);

    // Enforce per-period limits
    for (const limit of consent.periodicLimits) {
      const periodStart = this.getPeriodStart(limit.period);
      const existingTotal = this.sumPaymentsInPeriod(consentId, params.currency, periodStart);
      const max = new Money(limit.maxAmount, limit.currency);

      if (existingTotal.plus(requested.amount).gt(max.amount)) {
        throw new BadRequestException(
          `${limit.period}ly VRP limit of ${limit.maxAmount} ${limit.currency} would be exceeded`,
        );
      }
    }

    const { obPaymentId } = await this.paymentBridge.submitDomesticPayment(
      {
        consentId,
        initiation: {
          InstructedAmount: { Amount: params.amount, Currency: params.currency },
          CreditorAccount:  { Identification: params.creditorIban ?? '', Name: params.creditorName },
          CreditorName:     params.creditorName,
        },
      },
      idempotencyKey,
    );

    const payment: VrpPayment = {
      id:                   uuidv4(),
      consentId,
      clientId:             params.clientId,
      status:               'AcceptedSettlementInProcess',
      amount:               requested.toDecimalString(),
      currency:             params.currency,
      creditorAccount:      params.creditorAccount,
      bankingCorePaymentId: obPaymentId,
      createdAt:            new Date(),
    };

    vrpPaymentStore.set(payment.id, payment);

    void this.webhookDelivery.queueDelivery('payment.pending', {
      paymentId: payment.id,
      consentId,
      type:      'VRP',
      amount:    payment.amount,
      currency:  payment.currency,
    });

    this.logger.log(`VRP payment ${payment.id} for consent ${consentId}: ${params.amount} ${params.currency}`);
    return payment;
  }

  getVrpPayment(paymentId: string): VrpPayment {
    const payment = vrpPaymentStore.get(paymentId);
    if (!payment) throw new NotFoundException(`VRP payment ${paymentId} not found`);
    return payment;
  }

  private getPeriodStart(period: VrpPeriod): Date {
    const now = new Date();
    switch (period) {
      case 'Day':   return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'Week': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(now.getFullYear(), now.getMonth(), diff);
      }
      case 'Month': return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  private sumPaymentsInPeriod(consentId: string, currency: string, from: Date): Decimal {
    return [...vrpPaymentStore.values()]
      .filter(
        (p) =>
          p.consentId === consentId &&
          p.currency  === currency  &&
          p.status    !== 'Rejected' &&
          p.createdAt >= from,
      )
      .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
  }
}
