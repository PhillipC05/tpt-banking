import {
  All, Controller, Logger, NotFoundException, Param, Req, Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { PROXY_ROUTES } from './proxy-route.config';
import { ConfigService } from '@nestjs/config';

@ApiTags('Proxy')
@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly config: ConfigService,
  ) {}

  @All(':service/*')
  @ApiOperation({
    summary: 'Transparent proxy to upstream microservices',
    description:
      'Routes GET/POST/PUT/PATCH/DELETE to the matching upstream service based on the :service prefix. ' +
      'Propagates Authorization, Idempotency-Key, X-Step-Up-Token headers.',
  })
  async proxy(
    @Param('service') service: string,
    @Param('0') rest: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const route = PROXY_ROUTES.find((r) => r.prefix === `/${service}`);
    if (!route) {
      throw new NotFoundException(`No upstream route for service '${service}'`);
    }

    const upstreamBaseUrl = this.proxyService.resolveUpstream(route.upstreamEnv);
    const path            = `/${service}/${rest}`;
    const clientIp        = req.ip ?? (req.headers['x-forwarded-for'] as string);

    const result = await this.proxyService.forward({
      upstreamBaseUrl,
      path,
      method:  req.method,
      headers: req.headers,
      body:    req.body,
      query:   req.query as Record<string, string>,
      clientIp,
    });

    res.status(result.status).json(result.data);
  }
}
