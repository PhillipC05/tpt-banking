import { Injectable, OnModuleInit } from '@nestjs/common';
import { metrics, Counter, Histogram, UpDownCounter } from '@opentelemetry/api';

@Injectable()
export class MetricsService implements OnModuleInit {
  private meter = metrics.getMeter('tpt-banking');

  // HTTP
  httpRequestDuration!: Histogram;
  httpRequestTotal!: Counter;
  httpRequestErrors!: Counter;

  // Business
  transactionTotal!: Counter;
  transactionAmount!: Histogram;
  transferSagaTotal!: Counter;
  transferSagaFailed!: Counter;
  achBatchSize!: Histogram;
  activeConnections!: UpDownCounter;

  // Auth
  authAttempts!: Counter;
  authFailures!: Counter;
  stepUpAttempts!: Counter;

  onModuleInit(): void {
    this.httpRequestDuration = this.meter.createHistogram('http_request_duration_ms', {
      description: 'HTTP request duration in milliseconds',
      unit: 'ms',
    });

    this.httpRequestTotal = this.meter.createCounter('http_requests_total', {
      description: 'Total HTTP requests',
    });

    this.httpRequestErrors = this.meter.createCounter('http_request_errors_total', {
      description: 'Total HTTP request errors',
    });

    this.transactionTotal = this.meter.createCounter('transactions_total', {
      description: 'Total financial transactions processed',
    });

    this.transactionAmount = this.meter.createHistogram('transaction_amount_usd', {
      description: 'Financial transaction amounts in USD',
      unit: 'USD',
    });

    this.transferSagaTotal = this.meter.createCounter('transfer_saga_total', {
      description: 'Total transfer sagas initiated',
    });

    this.transferSagaFailed = this.meter.createCounter('transfer_saga_failed_total', {
      description: 'Total transfer sagas that failed and compensated',
    });

    this.achBatchSize = this.meter.createHistogram('ach_batch_size', {
      description: 'Number of entries per ACH batch',
    });

    this.activeConnections = this.meter.createUpDownCounter('active_connections', {
      description: 'Number of active WebSocket connections',
    });

    this.authAttempts = this.meter.createCounter('auth_attempts_total', {
      description: 'Total authentication attempts',
    });

    this.authFailures = this.meter.createCounter('auth_failures_total', {
      description: 'Total authentication failures',
    });

    this.stepUpAttempts = this.meter.createCounter('step_up_attempts_total', {
      description: 'Total step-up authentication attempts',
    });
  }
}
