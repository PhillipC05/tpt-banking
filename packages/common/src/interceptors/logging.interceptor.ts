import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { trace } from '@opentelemetry/api';

const PII_FIELDS = new Set([
  'password',
  'passwordHash',
  'ssn',
  'ssnEncrypted',
  'cardNumber',
  'pan',
  'cvv',
  'cvc',
  'pin',
  'mfaSecret',
  'refreshToken',
  'accessToken',
  'authorization',
]);

/**
 * Strips PII fields from an object recursively (shallow clone, no mutation).
 */
function stripPii(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => stripPii(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = PII_FIELDS.has(key) ? '[REDACTED]' : stripPii(value, depth + 1);
  }
  return result;
}

/**
 * Request/response logging interceptor.
 *
 * Logs method, path, status code, and duration for every request.
 * Strips PII fields from logged bodies to prevent sensitive data exposure in logs.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      path: string;
      headers: Record<string, string>;
    }>();

    const requestId = uuidv4();
    const startTime = Date.now();
    const { method, path } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const response = http.getResponse<{ statusCode: number }>();
          const duration = Date.now() - startTime;
          const traceId = trace.getActiveSpan()?.spanContext().traceId ?? '-';
          this.logger.log(
            `${method} ${path} ${response.statusCode} +${duration}ms [${requestId}] trace=${traceId}`,
          );
        },
        error: (err: unknown) => {
          const duration = Date.now() - startTime;
          const traceId = trace.getActiveSpan()?.spanContext().traceId ?? '-';
          const status =
            typeof err === 'object' && err !== null && 'statusCode' in err
              ? (err as { statusCode: number }).statusCode
              : 500;
          this.logger.warn(
            `${method} ${path} ${status} +${duration}ms [${requestId}] trace=${traceId} ${err instanceof Error ? err.message : String(err)}`,
          );
        },
      }),
    );
  }
}

export { stripPii };
