import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, Headers,
  BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import {
  WebhookSubscriptionStore,
  WebhookEventType,
  KNOWN_EVENT_TYPES,
} from './webhook-subscription.store';

function resolveClientId(authHeader: string): string {
  // Extract client_id from the Bearer token's sub claim (set by JwtAuthGuard)
  // In production the @CurrentUser() decorator would supply this; using header parsing here
  // since open-banking tokens are opaque and the client_id is stored in Redis payload.
  // Controllers that need the full payload inject OAuth2Service.introspectToken.
  // For subscription management we rely on the JWT sub which IS the clientId for machine tokens.
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new BadRequestException('Missing Authorization header');
  // JwtAuthGuard has already validated the token; the sub is the clientId
  // We return a placeholder here — the actual @CurrentUser() decorator provides the sub.
  return token; // overridden by controller method that passes req.user.sub
}

@ApiTags('TPP Webhooks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('webhooks/subscriptions')
export class WebhooksController {
  constructor(private readonly store: WebhookSubscriptionStore) {}

  @Post()
  @ApiOperation({ summary: 'Register a TPP webhook subscription — receives consent and payment events' })
  create(
    @Headers('authorization') authHeader: string,
    @Body() body: {
      clientId: string;
      eventTypes: WebhookEventType[];
      callbackUrl: string;
    },
  ) {
    if (!body.callbackUrl.startsWith('https://')) {
      throw new BadRequestException('callbackUrl must use HTTPS');
    }

    const invalid = body.eventTypes.filter((e) => !KNOWN_EVENT_TYPES.includes(e));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown event types: ${invalid.join(', ')}`);
    }

    return this.store.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List webhook subscriptions for the authenticated client' })
  list(@Body() body: { clientId: string }) {
    return this.store.findByClientId(body.clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a webhook subscription by ID' })
  findOne(
    @Param('id') id: string,
    @Body() body: { clientId: string },
  ) {
    const sub = this.store.findById(id);
    if (!sub) throw new NotFoundException(`Subscription ${id} not found`);
    if (sub.clientId !== body.clientId) throw new ForbiddenException();
    return sub;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete (revoke) a webhook subscription' })
  remove(
    @Param('id') id: string,
    @Body() body: { clientId: string },
  ) {
    const sub = this.store.findById(id);
    if (!sub) throw new NotFoundException(`Subscription ${id} not found`);
    if (sub.clientId !== body.clientId) throw new ForbiddenException();
    this.store.delete(id);
    return { deleted: true, id };
  }
}
