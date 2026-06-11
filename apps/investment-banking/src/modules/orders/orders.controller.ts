import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { OrderSide, OrderType, TimeInForce, OrderCapacity } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import {
  IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID,
} from 'class-validator';

class PlaceOrderDto {
  @IsUUID() instrumentId!: string;
  @IsOptional() @IsUUID() portfolioId?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsEnum(OrderSide) side!: OrderSide;
  @IsEnum(OrderType) orderType!: OrderType;
  @IsOptional() @IsEnum(TimeInForce) timeInForce?: TimeInForce;
  @IsOptional() @IsEnum(OrderCapacity) orderCapacity?: OrderCapacity;
  @IsNumber() @IsPositive() orderQty!: number;
  @IsOptional() @IsNumber() @IsPositive() price?: number;
  @IsOptional() @IsNumber() @IsPositive() stopPrice?: number;
  @IsString() currency!: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() desk?: string;
  @IsOptional() @IsString() text?: string;
}

class ModifyOrderDto {
  @IsOptional() @IsNumber() @IsPositive() orderQty?: number;
  @IsOptional() @IsNumber() @IsPositive() price?: number;
  @IsOptional() @IsNumber() @IsPositive() stopPrice?: number;
  @IsOptional() @IsEnum(TimeInForce) timeInForce?: TimeInForce;
}

@ApiTags('OMS — Orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Place a new order (FIX-compliant OMS)',
    description:
      'Accepts MARKET, LIMIT, STOP, STOP_LIMIT, TWAP, VWAP order types. ' +
      'Runs pre-trade compliance (lot size, short-sell locate). ' +
      'Returns FIX ClOrdID.',
  })
  place(@CurrentUser() user: JwtPayload, @Body() dto: PlaceOrderDto) {
    return this.ordersService.place({ ...dto, traderId: user.sub });
  }

  @Get('blotter')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get trade blotter — all orders for a date / portfolio / desk' })
  @ApiQuery({ name: 'date', type: String, required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'portfolioId', type: String, required: false })
  @ApiQuery({ name: 'desk', type: String, required: false })
  getBlotter(
    @Query('date') date?: string,
    @Query('portfolioId') portfolioId?: string,
    @Query('desk') desk?: string,
  ) {
    return this.ordersService.getBlotter({
      date: date ? new Date(date) : undefined,
      portfolioId,
      desk,
    });
  }

  @Get('open')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all open orders' })
  getOpenOrders(
    @CurrentUser() user: JwtPayload,
    @Query('portfolioId') portfolioId?: string,
    @Query('instrumentId') instrumentId?: string,
  ) {
    return this.ordersService.findOpenOrders({ portfolioId, instrumentId });
  }

  @Get(':id')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get order by ID' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findByIdOrThrow(id);
  }

  @Put(':id/cancel')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel an open order' })
  cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.ordersService.cancel(id, body.reason);
  }

  @Put(':id/modify')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Modify (cancel/replace) an open order' })
  modify(@Param('id') id: string, @Body() dto: ModifyOrderDto) {
    return this.ordersService.modify(id, dto);
  }
}
