import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CollectionCase,
  CollectionCaseStatus,
  WorkoutPlan,
  WorkoutPlanStatus,
  Loan,
  LoanStatus,
} from '@tpt/database';
import { OpenCollectionCaseDto } from './dto/open-collection-case.dto';
import { ProposeWorkoutPlanDto } from './dto/propose-workout-plan.dto';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    @InjectRepository(CollectionCase)
    private readonly casesRepo: Repository<CollectionCase>,
    @InjectRepository(WorkoutPlan)
    private readonly plansRepo: Repository<WorkoutPlan>,
    @InjectRepository(Loan)
    private readonly loansRepo: Repository<Loan>,
  ) {}

  // ─── Case management ───────────────────────────────────────────────────────

  async openCase(dto: OpenCollectionCaseDto): Promise<CollectionCase> {
    // Verify loan exists
    const loan = await this.loansRepo.findOne({ where: { id: dto.loanId } });
    if (!loan) throw new NotFoundException(`Loan ${dto.loanId} not found`);

    // Idempotent: return existing open case if one already exists for this loan
    const existing = await this.casesRepo.findOne({
      where: { loanId: dto.loanId, status: CollectionCaseStatus.OPEN },
    });
    if (existing) return existing;

    const collectionCase = this.casesRepo.create({
      loanId: dto.loanId,
      customerId: dto.customerId,
      daysOverdue: dto.daysOverdue,
      amountOverdue: dto.amountOverdue.toString(),
      currency: dto.currency ?? 'USD',
      missedPayments: dto.missedPayments,
      notes: dto.notes ?? null,
    });
    const saved = await this.casesRepo.save(collectionCase);

    // Mark loan DELINQUENT if not already
    if (loan.status === LoanStatus.ACTIVE) {
      await this.loansRepo.update(dto.loanId, {
        status: LoanStatus.DELINQUENT,
        daysPastDue: dto.daysOverdue,
      });
    }

    this.logger.log(`Collection case ${saved.id} opened for loan ${dto.loanId}`);
    return saved;
  }

  async updateDelinquency(
    caseId: string,
    daysOverdue: number,
    amountOverdue: number,
  ): Promise<CollectionCase> {
    const collectionCase = await this.findByIdOrThrow(caseId);
    await this.casesRepo.update(caseId, {
      daysOverdue,
      amountOverdue: amountOverdue.toString(),
    });

    // Escalate to DEFAULT if 90+ days overdue
    if (daysOverdue >= 90 && collectionCase.status === CollectionCaseStatus.OPEN) {
      await this.loansRepo.update(collectionCase.loanId, { status: LoanStatus.DEFAULT });
    }

    return this.findByIdOrThrow(caseId);
  }

  async assignCollector(caseId: string, collectorId: string): Promise<CollectionCase> {
    await this.findByIdOrThrow(caseId);
    await this.casesRepo.update(caseId, { collectorId });
    return this.findByIdOrThrow(caseId);
  }

  async chargeOff(caseId: string): Promise<CollectionCase> {
    const collectionCase = await this.findByIdOrThrow(caseId);
    if (
      collectionCase.status === CollectionCaseStatus.RESOLVED ||
      collectionCase.status === CollectionCaseStatus.CHARGED_OFF
    ) {
      throw new BadRequestException(`Case ${caseId} is already ${collectionCase.status}`);
    }

    await this.casesRepo.update(caseId, {
      status: CollectionCaseStatus.CHARGED_OFF,
      chargedOffAt: new Date(),
    });
    await this.loansRepo.update(collectionCase.loanId, { status: LoanStatus.CHARGED_OFF });

    this.logger.warn(`Loan ${collectionCase.loanId} charged off via case ${caseId}`);
    return this.findByIdOrThrow(caseId);
  }

  async resolve(caseId: string): Promise<CollectionCase> {
    const collectionCase = await this.findByIdOrThrow(caseId);
    if (collectionCase.status === CollectionCaseStatus.RESOLVED) {
      throw new BadRequestException(`Case ${caseId} is already resolved`);
    }

    await this.casesRepo.update(caseId, {
      status: CollectionCaseStatus.RESOLVED,
      resolvedAt: new Date(),
    });
    await this.loansRepo.update(collectionCase.loanId, {
      status: LoanStatus.ACTIVE,
      daysPastDue: 0,
    });

    this.logger.log(`Collection case ${caseId} resolved`);
    return this.findByIdOrThrow(caseId);
  }

  // ─── Workout plans ─────────────────────────────────────────────────────────

  async proposeWorkoutPlan(caseId: string, dto: ProposeWorkoutPlanDto): Promise<WorkoutPlan> {
    const collectionCase = await this.findByIdOrThrow(caseId);
    if (
      collectionCase.status !== CollectionCaseStatus.OPEN &&
      collectionCase.status !== CollectionCaseStatus.IN_WORKOUT
    ) {
      throw new BadRequestException(`Cannot propose workout plan for a ${collectionCase.status} case`);
    }

    const plan = this.plansRepo.create({
      collectionCaseId: caseId,
      type: dto.type,
      reducedPaymentAmount: dto.reducedPaymentAmount?.toString() ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      terms: dto.terms ?? null,
      notes: dto.notes ?? null,
    });
    const saved = await this.plansRepo.save(plan);

    await this.casesRepo.update(caseId, { status: CollectionCaseStatus.IN_WORKOUT });

    this.logger.log(`Workout plan ${saved.id} (${dto.type}) proposed for case ${caseId}`);
    return saved;
  }

  async activateWorkoutPlan(planId: string, approvedByUserId: string): Promise<WorkoutPlan> {
    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Workout plan ${planId} not found`);
    if (plan.status !== WorkoutPlanStatus.PROPOSED) {
      throw new BadRequestException(`Plan ${planId} is already ${plan.status}`);
    }

    await this.plansRepo.update(planId, {
      status: WorkoutPlanStatus.ACTIVE,
      approvedByUserId,
      approvedAt: new Date(),
    });
    return this.plansRepo.findOneOrFail({ where: { id: planId } });
  }

  async completeWorkoutPlan(planId: string): Promise<WorkoutPlan> {
    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Workout plan ${planId} not found`);

    await this.plansRepo.update(planId, { status: WorkoutPlanStatus.COMPLETED });
    return this.plansRepo.findOneOrFail({ where: { id: planId } });
  }

  async getWorkoutPlans(caseId: string): Promise<WorkoutPlan[]> {
    return this.plansRepo.find({
      where: { collectionCaseId: caseId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findByIdOrThrow(id: string): Promise<CollectionCase> {
    const c = await this.casesRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Collection case ${id} not found`);
    return c;
  }

  async findByLoan(loanId: string): Promise<CollectionCase[]> {
    return this.casesRepo.find({ where: { loanId }, order: { createdAt: 'DESC' } });
  }

  async findByCustomer(customerId: string): Promise<CollectionCase[]> {
    return this.casesRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async findOpen(): Promise<CollectionCase[]> {
    return this.casesRepo.find({
      where: [
        { status: CollectionCaseStatus.OPEN },
        { status: CollectionCaseStatus.IN_WORKOUT },
      ],
      order: { daysOverdue: 'DESC' },
    });
  }
}
