import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmlAlert, AmlAlertStatus, AmlAlertSeverity } from '@tpt/database';
import { AmlRulesEngine, TransactionContext, RuleViolation } from './rules/aml-rules.engine';

@Injectable()
export class AmlService {
  private readonly logger = new Logger(AmlService.name);

  // SLA in hours by severity
  private readonly DUE_DATE_HOURS: Record<AmlAlertSeverity, number> = {
    [AmlAlertSeverity.CRITICAL]: 24,
    [AmlAlertSeverity.HIGH]: 48,
    [AmlAlertSeverity.MEDIUM]: 72,
    [AmlAlertSeverity.LOW]: 168,
  };

  constructor(
    @InjectRepository(AmlAlert)
    private readonly alertRepo: Repository<AmlAlert>,
    private readonly rulesEngine: AmlRulesEngine,
  ) {}

  /**
   * Evaluates a transaction against all AML rules and creates alerts for violations.
   */
  async monitorTransaction(ctx: TransactionContext): Promise<AmlAlert[]> {
    const violations = await this.rulesEngine.evaluate(ctx);
    if (violations.length === 0) return [];

    const alerts: AmlAlert[] = [];

    for (const violation of violations) {
      const dueDate = new Date();
      dueDate.setHours(dueDate.getHours() + this.DUE_DATE_HOURS[violation.severity]);

      const alert = this.alertRepo.create({
        customerId: ctx.customerId,
        accountId: ctx.accountId,
        transactionId: ctx.transactionId,
        ruleCode: violation.ruleCode,
        severity: violation.severity,
        status: AmlAlertStatus.OPEN,
        description: violation.description,
        triggerData: violation.triggerData,
        riskScore: violation.riskScore,
        dueDate,
      });

      const saved = await this.alertRepo.save(alert);
      alerts.push(saved);

      this.logger.warn(
        `AML Alert created: ${saved.alertNumber} | ${violation.ruleCode} | ` +
        `severity=${violation.severity} | customer=${ctx.customerId}`,
      );
    }

    return alerts;
  }

  async assignAlert(alertId: string, assigneeUserId: string): Promise<AmlAlert> {
    const alert = await this.findByIdOrThrow(alertId);
    await this.alertRepo.update(alertId, {
      assignedToUserId: assigneeUserId,
      assignedAt: new Date(),
      status: AmlAlertStatus.UNDER_REVIEW,
    });
    return this.findByIdOrThrow(alertId);
  }

  async closeAlert(
    alertId: string,
    reviewerUserId: string,
    resolution: 'NO_ACTION' | 'SAR_FILED' | 'FALSE_POSITIVE',
    notes: string,
    caseId?: string,
  ): Promise<AmlAlert> {
    const alert = await this.findByIdOrThrow(alertId);

    const statusMap: Record<string, AmlAlertStatus> = {
      NO_ACTION: AmlAlertStatus.CLOSED_NO_ACTION,
      SAR_FILED: AmlAlertStatus.CLOSED_SAR_FILED,
      FALSE_POSITIVE: AmlAlertStatus.CLOSED_FALSE_POSITIVE,
    };

    await this.alertRepo.update(alertId, {
      status: statusMap[resolution],
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
      reviewerNotes: notes,
      caseId: caseId ?? null,
    });

    return this.findByIdOrThrow(alertId);
  }

  async escalate(alertId: string, caseId: string): Promise<AmlAlert> {
    await this.alertRepo.update(alertId, {
      status: AmlAlertStatus.ESCALATED,
      caseId,
    });
    return this.findByIdOrThrow(alertId);
  }

  async findByIdOrThrow(id: string): Promise<AmlAlert> {
    const alert = await this.alertRepo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException(`AML Alert ${id} not found`);
    return alert;
  }

  async findOpen(filters?: {
    severity?: AmlAlertSeverity;
    assignedToUserId?: string;
    overdue?: boolean;
  }): Promise<AmlAlert[]> {
    const qb = this.alertRepo
      .createQueryBuilder('alert')
      .where("alert.status IN ('OPEN','UNDER_REVIEW','ESCALATED')")
      .orderBy('alert.severity', 'DESC')
      .addOrderBy('alert.createdAt', 'ASC');

    if (filters?.severity) qb.andWhere('alert.severity = :sev', { sev: filters.severity });
    if (filters?.assignedToUserId) qb.andWhere('alert.assignedToUserId = :uid', { uid: filters.assignedToUserId });
    if (filters?.overdue) qb.andWhere('alert.dueDate < NOW()');

    return qb.getMany();
  }

  async findByCustomer(customerId: string): Promise<AmlAlert[]> {
    return this.alertRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async getMetrics(): Promise<{
    openByStatus: Record<string, number>;
    openBySeverity: Record<string, number>;
    overdueCount: number;
    avgResolutionHours: number;
  }> {
    const [bySeverity, overdue] = await Promise.all([
      this.alertRepo
        .createQueryBuilder('a')
        .select('a.severity', 'severity')
        .addSelect('COUNT(*)', 'count')
        .where("a.status IN ('OPEN','UNDER_REVIEW','ESCALATED')")
        .groupBy('a.severity')
        .getRawMany<{ severity: string; count: string }>(),
      this.alertRepo
        .createQueryBuilder('a')
        .where("a.status IN ('OPEN','UNDER_REVIEW')")
        .andWhere('a.dueDate < NOW()')
        .getCount(),
    ]);

    return {
      openByStatus: {},
      openBySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, parseInt(r.count)])),
      overdueCount: overdue,
      avgResolutionHours: 0,
    };
  }
}
