import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EddQuestionnaire, EddStatus } from '@tpt/database';
import {
  InitiateEddDto,
  SeniorManagerApprovalDto,
  SubmitQuestionnaireDto,
} from './dto/initiate-edd.dto';

@Injectable()
export class EddService {
  private readonly logger = new Logger(EddService.name);

  constructor(
    @InjectRepository(EddQuestionnaire)
    private readonly eddRepo: Repository<EddQuestionnaire>,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async initiateQuestionnaire(dto: InitiateEddDto): Promise<EddQuestionnaire> {
    // Idempotent: return the active questionnaire if one exists
    const existing = await this.eddRepo.findOne({
      where: [
        { customerId: dto.customerId, status: EddStatus.INITIATED },
        { customerId: dto.customerId, status: EddStatus.PENDING_CUSTOMER },
        { customerId: dto.customerId, status: EddStatus.PENDING_REVIEW },
        { customerId: dto.customerId, status: EddStatus.PENDING_MANAGER_APPROVAL },
      ],
    });
    if (existing) return existing;

    // 90-day window for customer to submit responses
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const questionnaire = this.eddRepo.create({
      customerId: dto.customerId,
      cddAssessmentId: dto.cddAssessmentId ?? null,
      status: EddStatus.PENDING_CUSTOMER,
      notes: dto.notes ?? null,
      expiresAt,
    });
    const saved = await this.eddRepo.save(questionnaire);
    this.logger.log(`EDD questionnaire ${saved.id} initiated for customer ${dto.customerId}`);
    return saved;
  }

  async submitCustomerResponses(
    id: string,
    dto: SubmitQuestionnaireDto,
  ): Promise<EddQuestionnaire> {
    const edd = await this.findByIdOrThrow(id);
    if (edd.status !== EddStatus.PENDING_CUSTOMER) {
      throw new BadRequestException(`EDD ${id} is not awaiting customer responses (status: ${edd.status})`);
    }

    await this.eddRepo.update(id, {
      questionnaireData: dto.questionnaireData,
      pepDetails: dto.pepDetails ?? null,
      adverseMediaDetails: dto.adverseMediaDetails ?? null,
      status: EddStatus.PENDING_REVIEW,
    });
    this.logger.log(`Customer responses submitted for EDD ${id}`);
    return this.findByIdOrThrow(id);
  }

  async review(
    id: string,
    reviewerId: string,
    decision: 'ESCALATE_TO_MANAGER' | 'APPROVE' | 'DECLINE',
    notes?: string,
  ): Promise<EddQuestionnaire> {
    const edd = await this.findByIdOrThrow(id);
    if (edd.status !== EddStatus.PENDING_REVIEW) {
      throw new BadRequestException(`EDD ${id} is not pending review (status: ${edd.status})`);
    }

    let newStatus: EddStatus;
    switch (decision) {
      case 'ESCALATE_TO_MANAGER':
        newStatus = EddStatus.PENDING_MANAGER_APPROVAL;
        break;
      case 'APPROVE':
        newStatus = EddStatus.APPROVED;
        break;
      case 'DECLINE':
        newStatus = EddStatus.DECLINED;
        break;
    }

    const updatePayload: Partial<EddQuestionnaire> = { status: newStatus };
    if (notes) updatePayload.notes = notes;
    if (decision === 'APPROVE') {
      updatePayload.approvedByUserId = reviewerId;
      updatePayload.approvedAt = new Date();
      updatePayload.nextReviewDate = this.annualReviewDate();
    }

    await this.eddRepo.update(id, updatePayload);
    this.logger.log(`EDD ${id} reviewed by ${reviewerId} → ${newStatus}`);
    return this.findByIdOrThrow(id);
  }

  /** Senior manager sign-off — required for HNW/VIP customers */
  async seniorManagerApprove(
    id: string,
    dto: SeniorManagerApprovalDto,
    finalApproverUserId: string,
  ): Promise<EddQuestionnaire> {
    const edd = await this.findByIdOrThrow(id);
    if (edd.status !== EddStatus.PENDING_MANAGER_APPROVAL) {
      throw new BadRequestException(`EDD ${id} is not pending manager approval (status: ${edd.status})`);
    }

    await this.eddRepo.update(id, {
      seniorManagerApproval: {
        managerId: dto.managerId,
        approvedAt: new Date().toISOString(),
        notes: dto.notes,
      },
      status: EddStatus.APPROVED,
      approvedByUserId: finalApproverUserId,
      approvedAt: new Date(),
      nextReviewDate: this.annualReviewDate(),
    });

    this.logger.log(`EDD ${id} senior manager approval granted by ${dto.managerId}`);
    return this.findByIdOrThrow(id);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findByIdOrThrow(id: string): Promise<EddQuestionnaire> {
    const e = await this.eddRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`EDD questionnaire ${id} not found`);
    return e;
  }

  async findByCustomer(customerId: string): Promise<EddQuestionnaire[]> {
    return this.eddRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async findPendingReview(): Promise<EddQuestionnaire[]> {
    return this.eddRepo.find({
      where: [
        { status: EddStatus.PENDING_REVIEW },
        { status: EddStatus.PENDING_MANAGER_APPROVAL },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private annualReviewDate(): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }
}
