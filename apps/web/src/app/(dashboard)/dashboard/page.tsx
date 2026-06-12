'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import { PageShell, Card, ErrorBanner } from '@/components/PageShell';
import type { AggregateHealthResponse, ServiceHealth } from '@/lib/types';

export default function DashboardPage() {
  const [health, setHealth] = useState<AggregateHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<AggregateHealthResponse>('/health/all')
      .then(({ data }) => setHealth(data))
      .catch(() => setError('Unable to reach the API gateway. Make sure services are running.'))
      .finally(() => setLoading(false));
  }, []);

  const overallColor =
    health?.status === 'ok'
      ? 'text-green-600'
      : health?.status === 'degraded'
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <PageShell
      title="Overview"
      description="Live health status of all platform services."
    >
      {error && <ErrorBanner message={error} />}

      {health && (
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-medium text-gray-600">Overall status:</span>
          <span className={`text-sm font-semibold capitalize ${overallColor}`}>
            {health.status}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading &&
          Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 w-32 bg-gray-100 rounded mb-3" />
              <div className="h-3 w-16 bg-gray-100 rounded" />
            </div>
          ))}

        {health?.services.map((svc: ServiceHealth) => (
          <Card key={svc.name} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-800 capitalize">
                {svc.name.replace(/-/g, ' ')}
              </span>
              <StatusBadge status={svc.status} />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{svc.upstream}</span>
              <span>{svc.latencyMs} ms</span>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
