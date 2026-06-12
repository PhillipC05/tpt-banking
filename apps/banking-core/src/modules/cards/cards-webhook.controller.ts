import { Controller, Headers, Post, RawBodyRequest, Req, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import Stripe from 'stripe';
import { StripeIssuingService } from './stripe-issuing.service';
import { DisputesService } from './disputes/disputes.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class CardsWebhookController {
  private readonly logger = new Logger(CardsWebhookController.name);

  constructor(
    private readonly stripeIssuing: StripeIssuingService,
    private readonly disputesService: DisputesService,
  ) {}

  @Post('stripe')
  @ApiOperation({
    summary: 'Stripe Issuing webhook — validates Stripe-Signature header',
    description: 'Receives Stripe issuing.authorization.* events. Requires STRIPE_WEBHOOK_SECRET env var.',
  })
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature: string,
  ) {
    if (!stripeSignature) {
      throw new UnauthorizedException('Missing Stripe-Signature header');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw body unavailable — ensure rawBody: true in NestFactory.create');
    }

    let event;
    try {
      event = this.stripeIssuing.parseAuthorizationWebhook(
        rawBody.toString('utf8'),
        stripeSignature,
      );
    } catch (err) {
      this.logger.warn(`Stripe webhook signature validation failed: ${err}`);
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }

    this.logger.log(`Stripe event received: ${event.type} (${event.id})`);

    // Route authorization events — approve all by default; extend with spending-rules logic here
    if (event.type === 'issuing_authorization.request') {
      const auth = event.data.object as { id: string };
      void this.stripeIssuing.approveAuthorization(auth.id).catch((e) => {
        this.logger.error(`Failed to approve authorization ${auth.id}: ${e}`);
      });
    }

    // Route dispute events
    const disputeEvents: Stripe.Event.Type[] = [
      'charge.dispute.created',
      'charge.dispute.updated',
      'charge.dispute.closed',
      'charge.dispute.funds_reinstated',
      'charge.dispute.funds_withdrawn',
    ];
    if (disputeEvents.includes(event.type as Stripe.Event.Type)) {
      void this.disputesService
        .upsertFromStripeEvent(event.data.object as Stripe.Dispute)
        .catch((e) => this.logger.error(`Failed to process dispute event ${event.id}: ${e}`));
    }

    return { received: true };
  }
}
