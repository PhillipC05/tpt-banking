import {
  BadGatewayException, BadRequestException, ForbiddenException,
  Injectable, Logger, NotFoundException, ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { IncomingHttpHeaders } from 'http';
import { DEFAULT_UPSTREAM_URLS } from './proxy-route.config';

const PROPAGATED_HEADERS = [
  'authorization',
  'idempotency-key',
  'x-step-up-token',
  'x-request-id',
  'x-correlation-id',
  'content-type',
  'accept',
];

const FORWARD_TIMEOUT_MS = 30_000;

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  resolveUpstream(envKey: string): string {
    const url =
      this.config.get<string>(envKey) ??
      DEFAULT_UPSTREAM_URLS[envKey] ??
      (() => { throw new BadRequestException(`No upstream configured for ${envKey}`); })();

    // SSRF prevention: only allow http/https to prevent file://, gopher://, etc.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`Upstream URL is malformed for ${envKey}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      this.logger.error(`Blocked non-HTTP upstream URL for ${envKey}: ${parsed.protocol}`);
      throw new ForbiddenException('Upstream URL scheme not permitted');
    }
    return url;
  }

  async forward(params: {
    upstreamBaseUrl: string;
    path: string;
    method: string;
    headers: IncomingHttpHeaders;
    body?: unknown;
    query?: Record<string, string>;
    clientIp?: string;
  }): Promise<{ status: number; data: unknown; headers: Record<string, string> }> {
    // Build upstream URL; strip any leading /v1 that the gateway already handles
    const cleanPath = params.path.replace(/^\/v1/, '');
    const url       = `${params.upstreamBaseUrl}/v1${cleanPath}`;

    const forwardHeaders: Record<string, string> = {};
    for (const name of PROPAGATED_HEADERS) {
      const val = params.headers[name];
      if (val) forwardHeaders[name] = Array.isArray(val) ? val[0] : val;
    }
    if (params.clientIp) {
      // Only use the first IP segment to prevent log injection via chained proxies
      const sanitizedIp = params.clientIp.split(',')[0].trim();
      forwardHeaders['x-forwarded-for'] = sanitizedIp;
    }

    const config: AxiosRequestConfig = {
      url,
      method:  params.method,
      headers: forwardHeaders,
      params:  params.query,
      timeout: FORWARD_TIMEOUT_MS,
      validateStatus: () => true, // handle all statuses manually
    };

    const hasBody = params.body && params.method !== 'GET' && params.method !== 'DELETE';
    if (hasBody) config.data = params.body;

    this.logger.debug(`Forwarding ${params.method} ${url}`);

    let response: AxiosResponse;
    try {
      response = await firstValueFrom(this.http.request(config));
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`Upstream unreachable: ${url} — ${msg}`);
      throw new ServiceUnavailableException(`Upstream service unavailable`);
    }

    // Surface upstream HTTP errors as NestJS exceptions so global filter serializes them
    if (response.status === 401) throw new UnauthorizedException(response.data);
    if (response.status === 403) throw new ForbiddenException(response.data);
    if (response.status === 404) throw new NotFoundException(response.data);
    if (response.status >= 500) throw new BadGatewayException(response.data);

    const responseHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(response.headers)) {
      if (typeof v === 'string') responseHeaders[k] = v;
    }

    return { status: response.status, data: response.data, headers: responseHeaders };
  }
}
