import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KafkaTopics, createBaseEvent } from '@tpt/kafka';
import type { AuditLogEvent } from '@tpt/kafka';

export interface AuditLogPayload {
  userId: string;
  action: string;
  /** e.g. 'CUSTOMER', 'ACCOUNT', 'TRANSACTION' */
  resource: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

/**
 * Publishes immutable audit events to the Kafka `audit.log` topic.
 *
 * The topic is write-only, never deleted, and must be configured for 7-year retention.
 * Inject this service into any service that performs state-mutating operations.
 *
 * When KAFKA_CLIENT is not available (e.g. in tests), logs are written via Logger only.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Optional() @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka | null,
  ) {}

  /**
   * Emits an audit log event to the `audit.log` Kafka topic.
   * Fire-and-forget — does not throw on Kafka unavailability.
   */
  log(payload: AuditLogPayload): void {
    const event: AuditLogEvent = {
      ...createBaseEvent(
        KafkaTopics.AUDIT_LOG,
        payload.correlationId ?? payload.userId,
      ),
      eventType: 'audit.log',
      data: {
        userId: payload.userId,
        action: payload.action,
        resource: payload.resource,
        resourceId: payload.resourceId,
        before: payload.before,
        after: payload.after,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
      },
    };

    if (this.kafkaClient) {
      this.kafkaClient.emit(KafkaTopics.AUDIT_LOG, {
        key: payload.userId,
        value: event,
      });
    } else {
      this.logger.warn(
        `[AUDIT-FALLBACK] ${payload.action} on ${payload.resource}:${payload.resourceId} by ${payload.userId}`,
      );
    }

    this.logger.debug(
      `Audit: ${payload.action} ${payload.resource}:${payload.resourceId} by ${payload.userId}`,
    );
  }
}
