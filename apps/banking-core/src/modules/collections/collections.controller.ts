import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@tpt/auth';
import { Roles } from '@tpt/auth';
import { Role } from '@tpt/auth';
import { CurrentUser } from '@tpt/common';
import { CollectionsService } from './collections.service';
import { OpenCollectionCaseDto } from './dto/open-collection-case.dto';
import { ProposeWorkoutPlanDto } from './dto/propose-workout-plan.dto';

@ApiTags('Collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  // ─── Cases ─────────────────────────────────────────────────────────────────

  @Post('cases')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Open a collection case for a delinquent loan' })
  openCase(@Body() dto: OpenCollectionCaseDto) {
    return this.collectionsService.openCase(dto);
  }

  @Get('cases/open')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List all open / in-workout collection cases' })
  listOpen() {
    return this.collectionsService.findOpen();
  }

  @Get('cases/:id')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Get a collection case by ID' })
  getCase(@Param('id', ParseUUIDPipe) id: string) {
    return this.collectionsService.findByIdOrThrow(id);
  }

  @Get('cases/loan/:loanId')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List collection cases for a loan' })
  byLoan(@Param('loanId', ParseUUIDPipe) loanId: string) {
    return this.collectionsService.findByLoan(loanId);
  }

  @Get('cases/customer/:customerId')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List collection cases for a customer' })
  byCustomer(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.collectionsService.findByCustomer(customerId);
  }

  @Patch('cases/:id/delinquency')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Update days-overdue and overdue amount' })
  updateDelinquency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { daysOverdue: number; amountOverdue: number },
  ) {
    return this.collectionsService.updateDelinquency(id, body.daysOverdue, body.amountOverdue);
  }

  @Patch('cases/:id/assign')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Assign a collector to the case' })
  assignCollector(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { collectorId: string },
  ) {
    return this.collectionsService.assignCollector(id, body.collectorId);
  }

  @Patch('cases/:id/charge-off')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Charge off the loan — marks CHARGED_OFF and closes the case' })
  chargeOff(@Param('id', ParseUUIDPipe) id: string) {
    return this.collectionsService.chargeOff(id);
  }

  @Patch('cases/:id/resolve')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Mark case resolved (customer caught up)' })
  resolve(@Param('id', ParseUUIDPipe) id: string) {
    return this.collectionsService.resolve(id);
  }

  // ─── Workout plans ─────────────────────────────────────────────────────────

  @Post('cases/:id/workout-plans')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Propose a workout plan for an open collection case' })
  proposeWorkoutPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposeWorkoutPlanDto,
  ) {
    return this.collectionsService.proposeWorkoutPlan(id, dto);
  }

  @Get('cases/:id/workout-plans')
  @Roles(Role.teller, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List workout plans for a collection case' })
  getWorkoutPlans(@Param('id', ParseUUIDPipe) id: string) {
    return this.collectionsService.getWorkoutPlans(id);
  }

  @Patch('workout-plans/:planId/activate')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Activate a proposed workout plan (requires manager approval)' })
  activateWorkoutPlan(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.collectionsService.activateWorkoutPlan(planId, user.sub);
  }

  @Patch('workout-plans/:planId/complete')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Mark a workout plan as completed' })
  completeWorkoutPlan(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.collectionsService.completeWorkoutPlan(planId);
  }
}
