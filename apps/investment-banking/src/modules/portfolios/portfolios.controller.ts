import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortfoliosService } from './portfolios.service';
import { PortfolioType, RiskProfile } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

class CreatePortfolioDto {
  @IsString() portfolioCode!: string;
  @IsString() displayName!: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(PortfolioType) type!: PortfolioType;
  @IsOptional() @IsEnum(RiskProfile) riskProfile?: RiskProfile;
  @IsString() baseCurrency!: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() benchmark?: string;
}

@ApiTags('Portfolios')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Post()
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new portfolio' })
  create(@Body() dto: CreatePortfolioDto) {
    return this.portfoliosService.create(dto);
  }

  @Get()
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all active portfolios' })
  findAll(
    @Query('type') type?: PortfolioType,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.portfoliosService.findAll({ type });
  }

  @Get(':id')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Get portfolio by ID' })
  findOne(@Param('id') id: string) {
    return this.portfoliosService.findByIdOrThrow(id);
  }

  @Get(':id/positions')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Get all positions for a portfolio (the book)' })
  getPositions(@Param('id') id: string) {
    return this.portfoliosService.getPositions(id);
  }

  @Post(':id/recalculate')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Recalculate portfolio totals from positions' })
  recalculate(@Param('id') id: string) {
    return this.portfoliosService.recalculateTotals(id);
  }
}
