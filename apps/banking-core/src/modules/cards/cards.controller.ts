import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CardsService } from './cards.service';
import { CardType, CardNetwork } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import {
  IsEnum, IsNumber, IsOptional, IsPositive, IsBoolean, IsUUID
} from 'class-validator';

class IssueCardDto {
  @IsUUID() accountId!: string;
  @IsEnum(CardType) type!: CardType;
  @IsOptional() @IsEnum(CardNetwork) network?: CardNetwork;
  @IsOptional() @IsBoolean() virtualOnly?: boolean;
  @IsOptional() @IsNumber() @IsPositive() spendingLimitDaily?: number;
  @IsOptional() @IsNumber() @IsPositive() spendingLimitMonthly?: number;
  @IsOptional() @IsNumber() @IsPositive() creditLimit?: number;
  @IsOptional() @IsNumber() apr?: number;
}

@ApiTags('Cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @Roles(Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Issue a new debit or credit card (via Stripe Issuing)' })
  issue(@CurrentUser() user: JwtPayload, @Body() dto: IssueCardDto) {
    return this.cardsService.issue({ ...dto, customerId: user.sub });
  }

  @Get('my')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT)
  @ApiOperation({ summary: 'Get all cards for the authenticated customer' })
  getMyCards(@CurrentUser() user: JwtPayload) {
    return this.cardsService.findByCustomer(user.sub);
  }

  @Get(':id')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get card details by ID' })
  findOne(@Param('id') id: string) {
    return this.cardsService.findByIdOrThrow(id);
  }

  @Get(':id/transactions')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get card transaction history' })
  getTransactions(@Param('id') id: string) {
    return this.cardsService.getTransactions(id);
  }

  @Post(':id/freeze')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Freeze a card (temporarily block all transactions)' })
  freeze(@Param('id') id: string) {
    return this.cardsService.freeze(id);
  }

  @Post(':id/unfreeze')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Unfreeze a frozen card' })
  unfreeze(@Param('id') id: string) {
    return this.cardsService.unfreeze(id);
  }

  @Post(':id/cancel')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Cancel a card (lost, stolen, or voluntary)' })
  cancel(
    @Param('id') id: string,
    @Body() body: { reason: 'LOST' | 'STOLEN' | 'CANCELLED' },
  ) {
    return this.cardsService.cancel(id, body.reason);
  }
}
