import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CardDispute, DisputeReason, DisputeStatus } from '@tpt/database';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);
  private readonly stripe: Stripe;

  constructor(
    @InjectRepository(CardDispute)
    private readonly disputesRepo: Repository<CardDispute>,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow<string>('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-04-10',
    });
  }

  // ─── Webhook handler (called from CardsWebhookController) ─────────────────

  async upsertFromStripeEvent(stripeDispute: Stripe.Dispute): Promise<CardDispute> {
    const status = this.mapStripeStatus(stripeDispute.status);
    const reason = this.mapStripeReason(stripeDispute.reason);

    const existing = await this.disputesRepo.findOne({
      where: { stripeDisputeId: stripeDispute.id },
    });

    const isResolved = status === DisputeStatus.WON || status === DisputeStatus.LOST;

    if (existing) {
      await this.disputesRepo.update(existing.id, {
        status,
        evidence: stripeDispute.evidence as unknown as Record<string, unknown>,
        stripeMetadata: stripeDispute as unknown as Record<string, unknown>,
        respondBy: stripeDispute.evidence_details?.due_by
          ? new Date(stripeDispute.evidence_details.due_by * 1000)
          : existing.respondBy,
        resolvedAt: isResolved ? (existing.resolvedAt ?? new Date()) : null,
      });
      this.logger.log(`Dispute ${stripeDispute.id} updated → ${status}`);
      return this.disputesRepo.findOneOrFail({ where: { id: existing.id } });
    }

    const dispute = this.disputesRepo.create({
      stripeDisputeId: stripeDispute.id,
      stripeChargeId: typeof stripeDispute.charge === 'string' ? stripeDispute.charge : stripeDispute.charge?.id ?? null,
      amount: (stripeDispute.amount / 100).toFixed(6), // Stripe stores in cents
      currency: stripeDispute.currency.toUpperCase(),
      reason,
      status,
      respondBy: stripeDispute.evidence_details?.due_by
        ? new Date(stripeDispute.evidence_details.due_by * 1000)
        : null,
      evidence: stripeDispute.evidence as unknown as Record<string, unknown>,
      stripeMetadata: stripeDispute as unknown as Record<string, unknown>,
      resolvedAt: isResolved ? new Date() : null,
    });
    const saved = await this.disputesRepo.save(dispute);
    this.logger.log(`Dispute ${stripeDispute.id} created with status ${status}`);
    return saved;
  }

  // ─── Evidence submission ───────────────────────────────────────────────────

  async submitEvidence(
    disputeId: string,
    evidence: Stripe.DisputeUpdateParams['evidence'],
  ): Promise<CardDispute> {
    const dispute = await this.findByIdOrThrow(disputeId);

    await this.stripe.disputes.update(dispute.stripeDisputeId, { evidence });

    await this.disputesRepo.update(disputeId, {
      evidence: evidence as unknown as Record<string, unknown>,
      status: DisputeStatus.UNDER_REVIEW,
    });

    this.logger.log(`Evidence submitted for dispute ${dispute.stripeDisputeId}`);
    return this.findByIdOrThrow(disputeId);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findByIdOrThrow(id: string): Promise<CardDispute> {
    const d = await this.disputesRepo.findOne({ where: { id } });
    if (!d) throw new NotFoundException(`Card dispute ${id} not found`);
    return d;
  }

  async findByCard(cardId: string): Promise<CardDispute[]> {
    return this.disputesRepo.find({ where: { cardId }, order: { createdAt: 'DESC' } });
  }

  async findOpen(): Promise<CardDispute[]> {
    return this.disputesRepo
      .createQueryBuilder('d')
      .where('d.status IN (:...statuses)', {
        statuses: [
          DisputeStatus.NEEDS_RESPONSE,
          DisputeStatus.WARNING_NEEDS_RESPONSE,
          DisputeStatus.UNDER_REVIEW,
          DisputeStatus.WARNING_UNDER_REVIEW,
        ],
      })
      .orderBy('d.respondBy', 'ASC')
      .getMany();
  }

  // ─── Mapping helpers ───────────────────────────────────────────────────────

  private mapStripeStatus(status: Stripe.Dispute.Status): DisputeStatus {
    const map: Record<string, DisputeStatus> = {
      warning_needs_response: DisputeStatus.WARNING_NEEDS_RESPONSE,
      warning_under_review:   DisputeStatus.WARNING_UNDER_REVIEW,
      warning_closed:         DisputeStatus.WARNING_CLOSED,
      needs_response:         DisputeStatus.NEEDS_RESPONSE,
      under_review:           DisputeStatus.UNDER_REVIEW,
      charge_refunded:        DisputeStatus.CHARGE_REFUNDED,
      won:                    DisputeStatus.WON,
      lost:                   DisputeStatus.LOST,
    };
    return map[status] ?? DisputeStatus.UNDER_REVIEW;
  }

  private mapStripeReason(reason: string): DisputeReason {
    const map: Record<string, DisputeReason> = {
      fraudulent:              DisputeReason.FRAUDULENT,
      unrecognized:            DisputeReason.UNRECOGNIZED,
      duplicate:               DisputeReason.DUPLICATE,
      product_not_received:    DisputeReason.PRODUCT_NOT_RECEIVED,
      product_unacceptable:    DisputeReason.PRODUCT_UNACCEPTABLE,
      credit_not_processed:    DisputeReason.CREDIT_NOT_PROCESSED,
      subscription_canceled:   DisputeReason.SUBSCRIPTION_CANCELED,
    };
    return map[reason] ?? DisputeReason.GENERAL;
  }
}
