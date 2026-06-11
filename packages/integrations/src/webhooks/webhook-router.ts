import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { WebhookValidator } from './webhook-validator.abstract';
import { WebhookEventStore } from './webhook-event-store';

export interface WebhookRouteConfig {
  validator: WebhookValidator;
  secret: string;
  /** Async handler — processes the validated, de-duplicated webhook body */
  handler: (body: unknown, headers: Record<string, string>) => Promise<void>;
}

@Injectable()
export class WebhookRouter {
  private readonly logger = new Logger(WebhookRouter.name);
  private readonly routes = new Map<string, WebhookRouteConfig>();

  constructor(private readonly eventStore: WebhookEventStore) {}

  register(providerId: string, config: WebhookRouteConfig): void {
    this.routes.set(providerId, config);
    this.logger.log(`Webhook route registered for provider: ${providerId}`);
  }

  async route(
    providerId: string,
    headers: Record<string, string>,
    rawBody: Buffer,
    eventId: string,
  ): Promise<void> {
    const route = this.routes.get(providerId);
    if (!route) {
      this.logger.warn(`No webhook route registered for provider: ${providerId}`);
      throw new UnauthorizedException(`Unknown provider: ${providerId}`);
    }

    const valid = route.validator.validate(headers, rawBody, route.secret);
    if (!valid) {
      this.logger.warn(`Signature validation failed for provider: ${providerId}`);
      throw new UnauthorizedException(`Invalid webhook signature for provider: ${providerId}`);
    }

    // Idempotency — skip already-processed events
    if (await this.eventStore.isProcessed(eventId)) {
      this.logger.log(`Duplicate webhook event ${eventId} from ${providerId} — skipped`);
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      body = rawBody.toString('utf8');
    }

    await this.eventStore.markProcessed(eventId);
    await route.handler(body, headers);
    this.logger.log(`Webhook event ${eventId} from ${providerId} processed`);
  }
}
