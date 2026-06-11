import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceCase, CaseType, CaseStatus, CasePriority } from '@tpt/database';

export interface CreateCaseDto {
  customerId: string;
  type: CaseType;
  priority?: CasePriority;
  subject: string;
  description?: string;
  alertIds?: string[];
  assignedToUserId?: string;
}

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(ComplianceCase)
    private readonly casesRepo: Repository<ComplianceCase>,
  ) {}

  async create(dto: CreateCaseDto): Promise<ComplianceCase> {
    const dueDate = this.calculateDueDate(dto.priority ?? CasePriority.MEDIUM);

    const complianceCase = this.casesRepo.create({
      customerId: dto.customerId,
      type: dto.type,
      priority: dto.priority ?? CasePriority.MEDIUM,
      subject: dto.subject,
      description: dto.description ?? null,
      alertIds: dto.alertIds ?? [],
      assignedToUserId: dto.assignedToUserId ?? null,
      dueDate,
      notes: [],
    });

    return this.casesRepo.save(complianceCase);
  }

  async addNote(
    caseId: string,
    userId: string,
    note: string,
  ): Promise<ComplianceCase> {
    const complianceCase = await this.findByIdOrThrow(caseId);

    const updatedNotes = [
      ...complianceCase.notes,
      { userId, note, timestamp: new Date().toISOString() },
    ];

    await this.casesRepo.update(caseId, { notes: updatedNotes });
    return this.findByIdOrThrow(caseId);
  }

  async updateStatus(
    caseId: string,
    status: CaseStatus,
    closedByUserId?: string,
    closureReason?: string,
  ): Promise<ComplianceCase> {
    const complianceCase = await this.findByIdOrThrow(caseId);

    const isClosing = [
      CaseStatus.CLOSED_NO_ACTION,
      CaseStatus.CLOSED_ACTION_TAKEN,
      CaseStatus.SAR_FILED,
    ].includes(status);

    await this.casesRepo.update(caseId, {
      status,
      ...(isClosing
        ? { closedAt: new Date(), closedByUserId, closureReason }
        : {}),
    });

    return this.findByIdOrThrow(caseId);
  }

  async linkSar(caseId: string, sarId: string): Promise<ComplianceCase> {
    await this.findByIdOrThrow(caseId);
    await this.casesRepo.update(caseId, {
      sarId,
      status: CaseStatus.SAR_FILED,
    });
    return this.findByIdOrThrow(caseId);
  }

  async findByIdOrThrow(id: string): Promise<ComplianceCase> {
    const c = await this.casesRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Compliance case ${id} not found`);
    return c;
  }

  async findByCustomer(customerId: string): Promise<ComplianceCase[]> {
    return this.casesRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async findOpen(): Promise<ComplianceCase[]> {
    return this.casesRepo
      .createQueryBuilder('c')
      .where("c.status IN ('OPEN','UNDER_INVESTIGATION','PENDING_ESCALATION')")
      .orderBy('c.priority', 'DESC')
      .addOrderBy('c.dueDate', 'ASC')
      .getMany();
  }

  private calculateDueDate(priority: CasePriority): Date {
    const hours: Record<CasePriority, number> = {
      [CasePriority.CRITICAL]: 24,
      [CasePriority.HIGH]: 72,
      [CasePriority.MEDIUM]: 168,  // 7 days
      [CasePriority.LOW]: 720,      // 30 days
    };
    const d = new Date();
    d.setHours(d.getHours() + hours[priority]);
    return d;
  }
}
