import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StatementsService } from './statements.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Statements')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('statements')
export class StatementsController {
  constructor(private readonly statementsService: StatementsService) {}

  @Get(':accountId')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate a monthly account statement' })
  @ApiQuery({ name: 'year', type: Number, required: true, example: 2025 })
  @ApiQuery({ name: 'month', type: Number, required: true, example: 4, description: '1-12' })
  generateStatement(
    @Param('accountId') accountId: string,
    @Query('year') year: number,
    @Query('month') month: number,
  ) {
    return this.statementsService.generateMonthlyStatement(accountId, { year: +year, month: +month });
  }

  @Get(':accountId/periods')
  @Roles(Role.RETAIL_CUSTOMER, Role.PREFERRED_CUSTOMER, Role.HNW_CLIENT, Role.VIP_CLIENT, Role.TELLER, Role.ADMIN)
  @ApiOperation({ summary: 'Get available statement periods (last 24 months)' })
  getPeriods() {
    return this.statementsService.availableStatementPeriods();
  }
}
