import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CardType, CardNetwork } from '@tpt/database';

/**
 * Stripe Issuing adapter.
 * Wraps the Stripe SDK for card issuing operations.
 * Physical/virtual cards are created and managed via Stripe Issuing.
 * PAN, CVV, and PIN are NEVER returned to or stored by our application.
 */
@Injectable()
export class StripeIssuingService {
  private readonly logger = new Logger(StripeIssuingService.name);
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(this.config.getOrThrow<string>('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-04-10',
    });
  }

  async createCardholder(params: {
    name: string;
    email: string;
    phone?: string;
    billingAddress: {
      line1: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }): Promise<{ cardholderId: string }> {
    const cardholder = await this.stripe.issuing.cardholders.create({
      name: params.name,
      email: params.email,
      phone_number: params.phone ?? undefined,
      type: 'individual',
      billing: {
        address: {
          line1: params.billingAddress.line1,
          city: params.billingAddress.city,
          state: params.billingAddress.state,
          postal_code: params.billingAddress.postalCode,
          country: params.billingAddress.country,
        },
      },
    });

    return { cardholderId: cardholder.id };
  }

  async issueCard(params: {
    cardholderId: string;
    type: CardType;
    currency: string;
    spendingLimits?: { amount: number; interval: 'daily' | 'weekly' | 'monthly' }[];
  }): Promise<{
    stripeCardId: string;
    lastFour: string;
    expiryMonth: number;
    expiryYear: number;
    network: string;
    status: string;
  }> {
    const cardType = params.type === CardType.VIRTUAL ? 'virtual' : 'physical';

    const spendingControls: Stripe.Issuing.CardCreateParams.SpendingControls = {};
    if (params.spendingLimits?.length) {
      spendingControls.spending_limits = params.spendingLimits.map((limit) => ({
        amount: Math.round(limit.amount * 100), // Stripe uses cents
        interval: limit.interval,
      }));
    }

    const card = await this.stripe.issuing.cards.create({
      cardholder: params.cardholderId,
      currency: params.currency.toLowerCase(),
      type: cardType,
      status: 'active',
      spending_controls: spendingControls,
    });

    return {
      stripeCardId: card.id,
      lastFour: card.last4,
      expiryMonth: card.exp_month,
      expiryYear: card.exp_year,
      network: card.brand.toUpperCase(),
      status: card.status,
    };
  }

  async freezeCard(stripeCardId: string): Promise<void> {
    await this.stripe.issuing.cards.update(stripeCardId, { status: 'inactive' });
  }

  async unfreezeCard(stripeCardId: string): Promise<void> {
    await this.stripe.issuing.cards.update(stripeCardId, { status: 'active' });
  }

  async cancelCard(stripeCardId: string): Promise<void> {
    await this.stripe.issuing.cards.update(stripeCardId, { status: 'canceled' });
  }

  async updateSpendingLimits(
    stripeCardId: string,
    limits: { amount: number; interval: 'daily' | 'weekly' | 'monthly' }[],
  ): Promise<void> {
    await this.stripe.issuing.cards.update(stripeCardId, {
      spending_controls: {
        spending_limits: limits.map((l) => ({
          amount: Math.round(l.amount * 100),
          interval: l.interval,
        })),
      },
    });
  }

  /**
   * Retrieves the card details from a Stripe webhook authorization event.
   * Called when a card authorization arrives from Stripe webhooks.
   */
  parseAuthorizationWebhook(rawBody: string, signature: string): Stripe.Event {
    const webhookSecret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async approveAuthorization(authorizationId: string): Promise<void> {
    await this.stripe.issuing.authorizations.approve(authorizationId);
  }

  async declineAuthorization(authorizationId: string): Promise<void> {
    await this.stripe.issuing.authorizations.decline(authorizationId);
  }
}
