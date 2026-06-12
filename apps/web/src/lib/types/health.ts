export interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  upstream: string;
}

export interface AggregateHealthResponse {
  status: 'ok' | 'degraded' | 'down';
  services: ServiceHealth[];
}
