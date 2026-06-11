import { ServiceUnavailableException } from '@nestjs/common';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of failures within windowMs before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Rolling window in ms within which failures are counted. Default: 60 000 */
  windowMs?: number;
  /** Time in ms after which an OPEN circuit transitions to HALF_OPEN. Default: 30 000 */
  recoveryMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number[] = [];   // timestamps of recent failures
  private openedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly recoveryMs: number;

  constructor(
    private readonly providerName: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.windowMs         = options.windowMs         ?? 60_000;
    this.recoveryMs       = options.recoveryMs       ?? 30_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.pruneFailures();
    this.checkRecovery();

    if (this.state === 'OPEN') {
      throw new ServiceUnavailableException(
        `Circuit for provider "${this.providerName}" is OPEN — too many recent failures`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.state    = 'CLOSED';
      this.failures = [];
      this.openedAt = null;
    }
  }

  private onFailure(): void {
    this.failures.push(Date.now());

    if (this.state === 'HALF_OPEN') {
      this.state    = 'OPEN';
      this.openedAt = Date.now();
      return;
    }

    if (this.failures.length >= this.failureThreshold) {
      this.state    = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  private checkRecovery(): void {
    if (this.state === 'OPEN' && this.openedAt !== null) {
      if (Date.now() - this.openedAt >= this.recoveryMs) {
        this.state = 'HALF_OPEN';
      }
    }
  }

  private pruneFailures(): void {
    const cutoff = Date.now() - this.windowMs;
    this.failures = this.failures.filter((ts) => ts > cutoff);
  }
}
