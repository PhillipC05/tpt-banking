import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebhookSubscriptionStore } from './webhook-subscription.store';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookConsumer } from './webhook.consumer';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    HttpModule.register({ timeout: 10_000 }),
    ClientsModule.registerAsync([
      {
        name: 'OPEN_BANKING_KAFKA',
        imports: [ConfigModule],
        useFactory: (cfg: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'open-banking-webhooks',
              brokers:  [cfg.get('KAFKA_BROKERS', 'localhost:9092')],
            },
            consumer: { groupId: 'ob-webhook-delivery-group' },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers:   [WebhookSubscriptionStore, WebhookDeliveryService, WebhookConsumer],
  controllers: [WebhooksController],
  exports:     [WebhookDeliveryService, WebhookSubscriptionStore],
})
export class WebhooksModule {}
