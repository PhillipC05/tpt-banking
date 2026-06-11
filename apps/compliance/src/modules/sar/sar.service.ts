import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sar, SarStatus, SarSuspiciousActivityType } from '@tpt/database';

export interface CreateSarDto {
  customerId: string;
  caseId?: string;
  activityType: SarSuspiciousActivityType;
  suspiciousAmount: number;
  activityFrom: Date;
  activityTo: Date;
  narrative: string;
  relatedTransactionIds?: string[];
  relatedAccountIds?: string[];
  subjectInfo?: Record<string, unknown>;
  preparedByUserId: string;
}

/**
 * SAR (Suspicious Activity Report) service.
 *
 * Dual-control: two separate compliance officers must approve before filing.
 * 30-day filing deadline from detection.
 * Narrative limited to 8,000 characters per FinCEN specification.
 */
@Injectable()
export class SarService {
  private readonly logger = new Logger(SarService.name);
  private readonly NARRATIVE_MAX_LENGTH = 8000;
  private readonly FILING_DEADLINE_DAYS = 30;

  constructor(
    @InjectRepository(Sar)
    private readonly sarRepo: Repository<Sar>,
  ) {}

  async create(dto: CreateSarDto): Promise<Sar> {
    if (dto.narrative.length > this.NARRATIVE_MAX_LENGTH) {
      throw new BadRequestException(
        `SAR narrative exceeds maximum length of ${this.NARRATIVE_MAX_LENGTH} characters`,
      );
    }

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + this.FILING_DEADLINE_DAYS);

    const sar = this.sarRepo.create({
      customerId: dto.customerId,
      caseId: dto.caseId ?? null,
      activityType: dto.activityType,
      suspiciousAmount: dto.suspiciousAmount.toFixed(2),
      activityFrom: dto.activityFrom,
      activityTo: dto.activityTo,
      narrative: dto.narrative,
      relatedTransactionIds: dto.relatedTransactionIds ?? [],
      relatedAccountIds: dto.relatedAccountIds ?? [],
      subjectInfo: dto.subjectInfo ?? null,
      preparedByUserId: dto.preparedByUserId,
      status: SarStatus.DRAFT,
      deadline,
    });

    const saved = await this.sarRepo.save(sar);
    this.logger.log(`SAR created: ${saved.sarNumber} | customer=${dto.customerId}`);
    return saved;
  }

  /**
   * First compliance officer approval.
   */
  async approveFirst(sarId: string, approverUserId: string): Promise<Sar> {
    const sar = await this.findByIdOrThrow(sarId);

    if (sar.status !== SarStatus.DRAFT && sar.status !== SarStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`SAR ${sarId} is not in a state that allows approval`);
    }
    if (sar.preparedByUserId === approverUserId) {
      throw new ForbiddenException('The preparer cannot be the first approver (dual-control)');
    }
    if (sar.firstApprovalUserId) {
      throw new BadRequestException('SAR already has a first approver');
    }

    await this.sarRepo.update(sarId, {
      firstApprovalUserId: approverUserId,
      firstApprovedAt: new Date(),
      status: SarStatus.PENDING_APPROVAL,
    });

    return this.findByIdOrThrow(sarId);
  }

  /**
   * Second compliance officer approval — enables filing.
   */
  async approveSecond(sarId: string, approverUserId: string): Promise<Sar> {
    const sar = await this.findByIdOrThrow(sarId);

    if (sar.status !== SarStatus.PENDING_APPROVAL) {
      throw new BadRequestException('SAR requires first approval before second approval');
    }
    if (!sar.firstApprovalUserId) {
      throw new BadRequestException('SAR has not been first-approved yet');
    }
    if (sar.firstApprovalUserId === approverUserId) {
      throw new ForbiddenException('First and second approver must be different (dual-control)');
    }
    if (sar.preparedByUserId === approverUserId) {
      throw new ForbiddenException('The preparer cannot be the second approver (dual-control)');
    }

    await this.sarRepo.update(sarId, {
      secondApprovalUserId: approverUserId,
      secondApprovedAt: new Date(),
      status: SarStatus.APPROVED,
    });

    return this.findByIdOrThrow(sarId);
  }

  /**
   * File the SAR with FinCEN.
   * In production this calls the FinCEN BSA E-Filing API.
   */
  async file(sarId: string, filerUserId: string): Promise<Sar> {
    const sar = await this.findByIdOrThrow(sarId);

    if (sar.status !== SarStatus.APPROVED) {
      throw new BadRequestException('SAR must be approved by two compliance officers before filing');
    }

    // TODO: Integrate with FinCEN BSA E-Filing API (https://bsaefiling.fincen.treas.gov/)
    // For now we simulate the filing and assign a mock BSA ID
    const mockBsaId = `BSA-${Date.now()}`;

    await this.sarRepo.update(sarId, {
      status: SarStatus.FILED,
      fincenBsaId: mockBsaId,
      filedAt: new Date(),
    });

    this.logger.log(`SAR ${sar.sarNumber} filed with FinCEN. BSA ID: ${mockBsaId}`);
    return this.findByIdOrThrow(sarId);
  }

  async findByIdOrThrow(id: string): Promise<Sar> {
    const sar = await this.sarRepo.findOne({ where: { id } });
    if (!sar) throw new NotFoundException(`SAR ${id} not found`);
    return sar;
  }

  async findByCustomer(customerId: string): Promise<Sar[]> {
    return this.sarRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async findPendingFiling(): Promise<Sar[]> {
    return this.sarRepo.find({
      where: [
        { status: SarStatus.DRAFT },
        { status: SarStatus.PENDING_APPROVAL },
        { status: SarStatus.APPROVED },
      ],
      order: { deadline: 'ASC' },
    });
  }

  async findOverdue(): Promise<Sar[]> {
    return this.sarRepo
      .createQueryBuilder('sar')
      .where("sar.status IN ('DRAFT','PENDING_APPROVAL','APPROVED')")
      .andWhere('sar.deadline < NOW()')
      .orderBy('sar.deadline', 'ASC')
      .getMany();
  }
}
