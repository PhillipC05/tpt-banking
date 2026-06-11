import { Logger, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export abstract class ProviderAdapter {
  protected readonly logger: Logger;

  constructor(protected readonly http: HttpService) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract name(): string;
  abstract isConfigured(cfg: ConfigService): boolean;

  /**
   * Make an HTTP call to the provider with automatic retry (3×) and 10s timeout.
   * Subclasses call this internally from their domain methods.
   */
  async call<T>(
    endpoint: string,
    payload: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const { method = 'POST', headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

    const config: AxiosRequestConfig = {
      headers,
      timeout: timeoutMs,
    };

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        let response: AxiosResponse<T>;

        if (method === 'GET' || method === 'DELETE') {
          response = await firstValueFrom(
            this.http.request<T>({ url: endpoint, method, ...config }),
          );
        } else {
          response = await firstValueFrom(
            this.http.request<T>({ url: endpoint, method, data: payload, ...config }),
          );
        }

        return response.data;
      } catch (err: unknown) {
        lastError = err;
        const isLastAttempt = attempt === MAX_RETRIES - 1;

        if (!isLastAttempt) {
          const delayMs = RETRY_DELAYS_MS[attempt] ?? 1_000;
          this.logger.warn(
            `${this.name()} call to ${endpoint} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delayMs}ms`,
          );
          await sleep(delayMs);
        }
      }
    }

    this.mapError(lastError, endpoint);
  }

  protected mapError(err: unknown, endpoint: string): never {
    const axiosErr = err as { response?: { status: number; data: unknown }; message?: string };
    const status  = axiosErr.response?.status ?? 0;
    const message = axiosErr.response?.data
      ? JSON.stringify(axiosErr.response.data)
      : axiosErr.message ?? 'Unknown error';

    this.logger.error(`${this.name()} call to ${endpoint} failed [HTTP ${status}]: ${message}`);

    throw new BadGatewayException(
      `Provider ${this.name()} is unavailable: ${message}`,
    );
  }
}
