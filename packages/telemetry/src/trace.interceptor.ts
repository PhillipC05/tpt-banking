import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<{ method: string; path: string }>();
    const spanName = `${req.method} ${req.path}`;

    const tracer = trace.getTracer('tpt-banking-http');
    const span = tracer.startSpan(spanName);
    const spanCtx = trace.setSpan(context.active(), span);

    // Inject trace ID into response headers so clients can correlate
    const res = http.getResponse<{
      setHeader: (k: string, v: string) => void;
    }>();
    const traceId = span.spanContext().traceId;
    res.setHeader('X-Trace-Id', traceId);

    return context.with(spanCtx, () =>
      next.handle().pipe(
        tap({
          next: () => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
          },
          error: (err: unknown) => {
            span.recordException(err instanceof Error ? err : new Error(String(err)));
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            span.end();
          },
        }),
      ),
    );
  }
}
