import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export type WebhookEventType =
  | 'consent.revoked'
  | 'consent.expired'
  | 'payment.settled'
  | 'payment.rejected'
  | 'payment.pending';

export const KNOWN_EVENT_TYPES: WebhookEventType[] = [
  'consent.revoked',
  'consent.expired',
  'payment.settled',
  'payment.rejected',
  'payment.pending',
];

export interface WebhookSubscription {
  id: string;
  clientId: string;
  eventTypes: WebhookEventType[];
  callbackUrl: string;        // HTTPS only
  signingSecret: string;      // HMAC key for X-TPP-Signature
  status: 'ACTIVE' | 'SUSPENDED';
  retryCount: number;         // cumulative failed delivery attempts
  createdAt: Date;
}

// Production: replace with TypeORM entity + migration (ob_webhook_subscriptions table).
// In-memory store loses subscriptions on restart — acceptable for dev only.
@Injectable()
export class WebhookSubscriptionStore {
  private readonly subscriptions = new Map<string, WebhookSubscription>();

  create(params: {
    clientId: string;
    eventTypes: WebhookEventType[];
    callbackUrl: string;
  }): WebhookSubscription {
    const sub: WebhookSubscription = {
      id:            uuidv4(),
      clientId:      params.clientId,
      eventTypes:    params.eventTypes,
      callbackUrl:   params.callbackUrl,
      signingSecret: uuidv4().replace(/-/g, ''),
      status:        'ACTIVE',
      retryCount:    0,
      createdAt:     new Date(),
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  findById(id: string): WebhookSubscription | undefined {
    return this.subscriptions.get(id);
  }

  findByClientId(clientId: string): WebhookSubscription[] {
    return [...this.subscriptions.values()].filter((s) => s.clientId === clientId);
  }

  findByEventType(eventType: WebhookEventType): WebhookSubscription[] {
    return [...this.subscriptions.values()].filter(
      (s) => s.status === 'ACTIVE' && s.eventTypes.includes(eventType),
    );
  }

  suspend(id: string): WebhookSubscription | undefined {
    const sub = this.subscriptions.get(id);
    if (sub) {
      sub.status = 'SUSPENDED';
      this.subscriptions.set(id, sub);
    }
    return sub;
  }

  delete(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  incrementRetryCount(id: string): void {
    const sub = this.subscriptions.get(id);
    if (sub) {
      sub.retryCount += 1;
      this.subscriptions.set(id, sub);
    }
  }
}
