import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { KafkaTopics } from '@tpt/kafka';
import { WebhookSubscriptionStore, WebhookEventType } from './webhook-subscription.store';

export interface WebhookDeliveryMessage {
  deliveryId: string;
  subscriptionId: string;
  callbackUrl: string;
  signingSecret: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  attempt: number;
  scheduledAt: string;  // ISO8601 — consumer skips if not yet due
}

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000] as const; // 1min, 5min, 30min
const MAX_ATTEMPTS = 3;
const DELIVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly http: HttpService,
    private readonly store: WebhookSubscriptionStore,
    @Inject('OPEN_BANKING_KAFKA') private readonly kafka: ClientKafka,
  ) {}

  /** Queue a webhook event for all matching active subscriptions */
  async queueDelivery(
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const subscriptions = this.store.findByEventType(eventType);
    if (subscriptions.length === 0) return;

    for (const sub of subscriptions) {
      const message: WebhookDeliveryMessage = {
        deliveryId:     uuidv4(),
        subscriptionId: sub.id,
        callbackUrl:    sub.callbackUrl,
        signingSecret:  sub.signingSecret,
        eventType,
        payload:        { ...payload, eventType, deliveredAt: new Date().toISOString() },
        attempt:        1,
        scheduledAt:    new Date().toISOString(),
      };

      this.kafka.emit(KafkaTopics.OB_WEBHOOK_OUTBOUND, {
        key:   sub.id,
        value: message,
      });

      this.logger.log(
        `Queued webhook ${message.deliveryId} for subscription ${sub.id} (${eventType} → ${sub.callbackUrl})`,
      );
    }
  }

  /** Deliver a single webhook message (called by the Kafka consumer) */
  async deliverWebhook(message: WebhookDeliveryMessage): Promise<void> {
    const { deliveryId, subscriptionId, callbackUrl, signingSecret, payload, attempt } = message;

    // Skip if not yet due (retry delay not elapsed)
    if (message.scheduledAt && new Date(message.scheduledAt) > new Date()) {
      this.logger.debug(`Webhook ${deliveryId} not yet due (scheduledAt=${message.scheduledAt}), requeueing`);
      this.kafka.emit(KafkaTopics.OB_WEBHOOK_OUTBOUND, { key: subscriptionId, value: message });
      return;
    }

    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', signingSecret).update(body).digest('hex');

    try {
      await firstValueFrom(
        this.http.post(callbackUrl, payload, {
          headers: {
            'Content-Type':      'application/json',
            'X-TPP-Signature':   `sha256=${signature}`,
            'X-Webhook-Event':   payload['eventType'] as string,
            'X-Delivery-ID':     deliveryId,
            'X-Attempt-Number':  String(attempt),
          },
          timeout: DELIVERY_TIMEOUT_MS,
        }),
      );

      this.logger.log(`Webhook ${deliveryId} delivered to ${callbackUrl} (attempt ${attempt})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook ${deliveryId} delivery failed (attempt ${attempt}): ${msg}`);

      if (attempt < MAX_ATTEMPTS) {
        const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 60_000;
        const nextScheduledAt = new Date(Date.now() + delayMs).toISOString();

        const retry: WebhookDeliveryMessage = {
          ...message,
          attempt:     attempt + 1,
          scheduledAt: nextScheduledAt,
        };

        this.kafka.emit(KafkaTopics.OB_WEBHOOK_OUTBOUND, { key: subscriptionId, value: retry });
        this.logger.log(`Webhook ${deliveryId} requeued for retry at ${nextScheduledAt}`);
      } else {
        this.store.incrementRetryCount(subscriptionId);
        this.kafka.emit(KafkaTopics.INTEGRATION_WEBHOOK_DLQ, {
          key:   subscriptionId,
          value: { ...message, failedAt: new Date().toISOString(), reason: msg },
        });
        this.logger.error(
          `Webhook ${deliveryId} exhausted ${MAX_ATTEMPTS} attempts — sent to DLQ`,
        );
      }
    }
  }
}
