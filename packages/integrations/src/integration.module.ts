import { Module } from '@nestjs/common';
import { IntegrationRegistry } from './registry/integration-registry';
import { WebhookRouter } from './webhooks/webhook-router';
import { WebhookEventStore } from './webhooks/webhook-event-store';

@Module({
  providers: [IntegrationRegistry, WebhookRouter, WebhookEventStore],
  exports:   [IntegrationRegistry, WebhookRouter, WebhookEventStore],
})
export class IntegrationModule {}
