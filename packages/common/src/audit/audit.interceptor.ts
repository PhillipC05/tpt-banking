import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * HTTP interceptor that automatically emits an audit event for every
 * state-mutating request (POST / PUT / PATCH / DELETE).
 *
 * Register globally in an app that has AuditModule imported:
 *   app.useGlobalInterceptors(app.get(AuditInterceptor))
 *
 * Or wire it per-controller with @UseInterceptors(AuditInterceptor).
 *
 * The event records:
 *   - userId    — from JWT payload (`request.user.sub`)
 *   - action    — `<METHOD> <path>`
 *   - resource  — first path segment after the version prefix
 *   - ipAddress — X-Forwarded-For or socket remote address
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      path: string;
      ip: string;
      headers: Record<string, string | string[]>;
      user?: { sub?: string; id?: string };
    }>();

    const { method, path } = request;

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const userId = request.user?.sub ?? request.user?.id ?? 'anonymous';
          const resource = extractResource(path);
          const forwarded = request.headers['x-forwarded-for'];
          const ipAddress = Array.isArray(forwarded)
            ? forwarded[0]
            : (forwarded ?? request.ip ?? 'unknown').split(',')[0].trim();

          this.auditService.log({
            userId,
            action: `${method} ${path}`,
            resource,
            resourceId: extractResourceId(path),
            ipAddress,
            userAgent: request.headers['user-agent'] as string | undefined,
          });
        },
      }),
    );
  }
}

/** Returns the primary resource name from a versioned path like /v1/accounts/123 → 'accounts' */
function extractResource(path: string): string {
  const segments = path.replace(/^\//, '').split('/');
  // Skip version segment (v1, v2, ...)
  const start = /^v\d+$/.test(segments[0] ?? '') ? 1 : 0;
  return segments[start] ?? path;
}

/** Returns the resource ID segment if present, otherwise the full path */
function extractResourceId(path: string): string {
  const segments = path.replace(/^\//, '').split('/');
  const start = /^v\d+$/.test(segments[0] ?? '') ? 1 : 0;
  return segments[start + 1] ?? segments[start] ?? path;
}
