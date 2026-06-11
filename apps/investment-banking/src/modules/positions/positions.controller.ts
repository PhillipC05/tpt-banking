import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Positions & P&L')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get('portfolio/:portfolioId')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Get all positions for a portfolio with P&L' })
  findByPortfolio(@Param('portfolioId') portfolioId: string) {
    return this.positionsService.findByPortfolio(portfolioId);
  }

  @Get('instrument/:instrumentId/exposure')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get firm-wide aggregated long/short exposure for an instrument' })
  getExposure(@Param('instrumentId') instrumentId: string) {
    return this.positionsService.getAggregatedExposure(instrumentId);
  }

  @Post('portfolio/:portfolioId/mark-to-market')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TRADER)
  @ApiOperation({ summary: 'Re-mark all positions in a portfolio to current prices' })
  markToMarket(@Param('portfolioId') portfolioId: string) {
    return this.positionsService.markToMarket(portfolioId);
  }
}
