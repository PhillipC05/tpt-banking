import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, Role } from '@tpt/auth';
import Stripe from 'stripe';
import { DisputesService } from './disputes.service';

@ApiTags('Card Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List disputes needing a response or under review' })
  listOpen() {
    return this.disputesService.findOpen();
  }

  @Get(':id')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Get a dispute by internal ID' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.disputesService.findByIdOrThrow(id);
  }

  @Get('card/:cardId')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List disputes for a card' })
  byCard(@Param('cardId', ParseUUIDPipe) cardId: string) {
    return this.disputesService.findByCard(cardId);
  }

  @Post(':id/evidence')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Submit evidence for a dispute to Stripe' })
  submitEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { evidence: Stripe.DisputeUpdateParams['evidence'] },
  ) {
    return this.disputesService.submitEvidence(id, body.evidence);
  }
}
