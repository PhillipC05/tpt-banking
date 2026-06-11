import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

const KEY_PREFIX = 'wh:event:';
const TTL_SECONDS = 86_400; // 24 hours — matches IdempotencyInterceptor window

@Injectable()
export class WebhookEventStore {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const val = await this.redis.get(`${KEY_PREFIX}${eventId}`);
    return val !== null;
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.redis.setex(`${KEY_PREFIX}${eventId}`, TTL_SECONDS, '1');
  }
}
