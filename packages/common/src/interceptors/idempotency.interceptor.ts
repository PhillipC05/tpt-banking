import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours
const KEY_PREFIX = 'idempotency:';

/**
 * Idempotency interceptor for POST/PATCH/PUT endpoints.
 *
 * Reads the `Idempotency-Key` header and:
 *   1. If a cached response exists → returns it immediately with `X-Idempotency-Replay: true`
 *   2. If no cached response → executes the handler and caches the successful response
 *
 * POST endpoints that mutate financial state MUST use this interceptor.
 * Apply via @UseInterceptors(IdempotencyInterceptor) at controller or route level.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      headers: Record<string, string>;
      path: string;
    }>();
    const response = http.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
      setHeader: (name: string, value: string) => void;
      statusCode: number;
    }>();

    const method = request.method?.toUpperCase();

    // Only intercept mutating methods
    if (!['POST', 'PATCH', 'PUT'].includes(method)) {
      return next.handle();
    }

    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey) {
      if (method === 'POST') {
        throw new UnprocessableEntityException(
          'POST requests to financial endpoints require an Idempotency-Key header',
        );
      }
      return next.handle();
    }

    const redisKey = `${KEY_PREFIX}${idempotencyKey}`;

    const cached = await this.redis.get(redisKey);
    if (cached) {
      this.logger.debug(`Idempotency cache hit for key ${idempotencyKey}`);
      const { statusCode, body } = JSON.parse(cached) as {
        statusCode: number;
        body: unknown;
      };
      response.setHeader('X-Idempotency-Replay', 'true');
      response.status(statusCode).json(body);
      // Return an empty observable since response is already sent
      return new Observable((subscriber) => subscriber.complete());
    }

    return next.handle().pipe(
      tap({
        next: async (body: unknown) => {
          const statusCode = response.statusCode ?? 200;
          await this.redis.setex(
            redisKey,
            IDEMPOTENCY_TTL_SECONDS,
            JSON.stringify({ statusCode, body }),
          );
        },
        error: () => {
          // Do not cache error responses — allow retry on failure
        },
      }),
    );
  }
}
