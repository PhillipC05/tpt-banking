import { v4 as uuidv4 } from 'uuid';

/**
 * Base interface for all domain events published to Kafka.
 *
 * Every event must have:
 * - `eventId`       — unique ID for deduplication
 * - `eventType`     — e.g. 'accounts.created'
 * - `occurredAt`    — ISO 8601 timestamp (server-side, NTP-synced)
 * - `correlationId` — traces a request across multiple services
 * - `causationId`   — ID of the event that caused this event (for event chains)
 */
export interface BaseEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  version: number;
}

/**
 * Creates a base event with auto-generated eventId and occurredAt.
 */
export function createBaseEvent(
  eventType: string,
  correlationId: string,
  causationId?: string,
): BaseEvent {
  return {
    eventId: uuidv4(),
    eventType,
    occurredAt: new Date().toISOString(),
    correlationId,
    causationId,
    version: 1,
  };
}

// ─── Domain Event Types ──────────────────────────────────────────────────────

export interface AccountCreatedEvent extends BaseEvent {
  eventType: 'accounts.created';
  data: {
    accountId: string;
    accountNumber: string;
    customerId: string;
    type: string;
    currency: string;
  };
}

export interface TransactionCompletedEvent extends BaseEvent {
  eventType: 'transactions.completed';
  data: {
    transactionId: string;
    transactionNumber: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: string;
    currency: string;
    journalId: string;
  };
}

export interface TransactionFailedEvent extends BaseEvent {
  eventType: 'transactions.failed';
  data: {
    transactionId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: string;
    currency: string;
    reason: string;
  };
}

export interface AuditLogEvent extends BaseEvent {
  eventType: 'audit.log';
  data: {
    userId: string;
    action: string;
    resource: string;
    resourceId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  };
}
