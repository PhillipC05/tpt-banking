import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KafkaTopics } from '@tpt/kafka';
import { WebhookDeliveryService, WebhookDeliveryMessage } from './webhook-delivery.service';

@Controller()
export class WebhookConsumer {
  constructor(private readonly deliveryService: WebhookDeliveryService) {}

  @EventPattern(KafkaTopics.OB_WEBHOOK_OUTBOUND)
  async handleOutboundWebhook(
    @Payload() message: { value: WebhookDeliveryMessage },
  ): Promise<void> {
    await this.deliveryService.deliverWebhook(message.value);
  }
}
