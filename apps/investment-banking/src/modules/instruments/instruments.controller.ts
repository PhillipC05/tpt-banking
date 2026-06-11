import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InstrumentsService } from './instruments.service';
import { AssetClass } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

class UpsertInstrumentDto {
  @IsOptional() @IsString() isin?: string;
  @IsOptional() @IsString() cusip?: string;
  @IsOptional() @IsString() ticker?: string;
  @IsString() displayName!: string;
  @IsEnum(AssetClass) assetClass!: AssetClass;
  @IsString() currency!: string;
  @IsOptional() @IsString() exchange?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsNumber() couponRate?: number;
  @IsOptional() @IsNumber() @IsPositive() lotSize?: number;
}

@ApiTags('Instruments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TRADER)
  @ApiOperation({ summary: 'Create or update an instrument in the master data store' })
  upsert(@Body() dto: UpsertInstrumentDto) {
    return this.instrumentsService.upsert(dto);
  }

  @Get('search')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Search instruments by ticker / ISIN / CUSIP / name' })
  @ApiQuery({ name: 'q', type: String })
  @ApiQuery({ name: 'assetClass', enum: AssetClass, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  search(
    @Query('q') query: string,
    @Query('assetClass') assetClass?: AssetClass,
    @Query('limit') limit?: number,
  ) {
    return this.instrumentsService.search(query, assetClass, limit ? +limit : 20);
  }

  @Get('isin/:isin')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Find instrument by ISIN' })
  findByIsin(@Param('isin') isin: string) {
    return this.instrumentsService.findByIsin(isin);
  }

  @Get('asset-class/:assetClass')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Get all instruments of a given asset class' })
  findByAssetClass(@Param('assetClass') assetClass: AssetClass) {
    return this.instrumentsService.findByAssetClass(assetClass);
  }

  @Get(':id')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Get instrument by ID' })
  findOne(@Param('id') id: string) {
    return this.instrumentsService.findByIdOrThrow(id);
  }

  @Put(':id/price')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update last price (used by market data feed)' })
  updatePrice(@Param('id') id: string, @Body() body: { price: number }) {
    return this.instrumentsService.updatePrice(id, body.price);
  }
}
