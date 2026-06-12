import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PROXY_ROUTES, DEFAULT_UPSTREAM_URLS } from './proxy-route.config';

interface ServiceHealth {
  name:      string;
  status:    'ok' | 'degraded' | 'down';
  latencyMs: number;
  upstream:  string;
}

@ApiTags('Health')
@Controller('health')
export class AggregateHealthController {
  private readonly logger = new Logger(AggregateHealthController.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  @Get('all')
  @ApiOperation({
    summary: 'Aggregate health check — fans out to all upstream services',
    description: 'Returns status of every upstream service. Overall status is "ok" only if all services are healthy.',
  })
  async healthAll(): Promise<{
    status: 'ok' | 'degraded' | 'down';
    services: ServiceHealth[];
  }> {
    const checks = PROXY_ROUTES.map(async (route) => {
      const base      = this.config.get<string>(route.upstreamEnv) ?? DEFAULT_UPSTREAM_URLS[route.upstreamEnv] ?? '';
      const url       = `${base}/v1/health`;
      const startedAt = Date.now();

      try {
        await firstValueFrom(
          this.http.get(url, { timeout: 5_000, validateStatus: () => true }),
        );
        const latencyMs = Date.now() - startedAt;
        return { name: route.serviceName, status: 'ok' as const, latencyMs, upstream: base };
      } catch {
        const latencyMs = Date.now() - startedAt;
        this.logger.warn(`Health check failed for ${route.serviceName} at ${url}`);
        return { name: route.serviceName, status: 'down' as const, latencyMs, upstream: base };
      }
    });

    const services = await Promise.all(checks);
    const downCount = services.filter((s) => s.status === 'down').length;
    const overallStatus =
      downCount === 0               ? 'ok'       :
      downCount < services.length   ? 'degraded' : 'down';

    return { status: overallStatus, services };
  }
}
