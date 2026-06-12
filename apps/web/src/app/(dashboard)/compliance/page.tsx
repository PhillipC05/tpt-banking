'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import {
  PageShell,
  Card,
  CardHeader,
  LoadingRows,
  EmptyState,
  ErrorBanner,
  StatCard,
} from '@/components/PageShell';
import { formatDateTime } from '@/lib/format';

interface AlertMetrics {
  totalOpen: number;
  critical: number;
  overdue: number;
  avgResolutionDays: number;
  severityDistribution: Record<string, number>;
}

interface AmlAlert {
  id: string;
  alertNumber: string;
  customerId: string;
  ruleCode: string;
  severity: string;
  status: string;
  description: string;
  riskScore: number;
  dueDate: string;
  createdAt: string;
}

interface ComplianceCase {
  id: string;
  caseNumber: string;
  customerId: string;
  type: string;
  status: string;
  priority: string;
  subject: string;
  assignedToUserId: string;
  dueDate: string;
  createdAt: string;
}

export default function CompliancePage() {
  const [metrics, setMetrics] = useState<AlertMetrics | null>(null);
  const [alerts, setAlerts] = useState<AmlAlert[]>([]);
  const [cases, setCases] = useState<ComplianceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get<AlertMetrics>('/compliance/aml/alerts/metrics'),
      apiClient.get<AmlAlert[]>('/compliance/aml/alerts', {
        params: { severity: 'HIGH' },
      }),
      apiClient.get<ComplianceCase[]>('/compliance/cases'),
    ])
      .then(([metricsRes, alertsRes, casesRes]) => {
        setMetrics(metricsRes.data);
        setAlerts(alertsRes.data);
        setCases(casesRes.data);
      })
      .catch(() => setError('Failed to load compliance data.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell
      title="Compliance"
      description="AML alerts, KYC verifications, and compliance cases."
    >
      {error && <ErrorBanner message={error} />}

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Open Alerts" value={metrics.totalOpen} />
          <StatCard
            label="Critical"
            value={metrics.critical}
            valueColor={metrics.critical > 0 ? 'text-red-600' : undefined}
          />
          <StatCard
            label="Overdue"
            value={metrics.overdue}
            valueColor={metrics.overdue > 0 ? 'text-orange-600' : undefined}
          />
          <StatCard
            label="Avg Resolution"
            value={`${metrics.avgResolutionDays?.toFixed(1) ?? '—'} days`}
          />
        </div>
      )}
      {loading && !metrics && (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
              <div className="h-7 w-16 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* AML Alerts */}
      <Card>
        <CardHeader
          title="High-Severity AML Alerts"
          subtitle="Open alerts requiring review"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Alert</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Rule</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Severity</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Risk Score</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Due</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && <LoadingRows cols={7} />}
              {!loading && alerts.length === 0 && (
                <EmptyState message="No high-severity alerts." />
              )}
              {alerts.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <div className="font-medium text-gray-900">{a.alertNumber}</div>
                    <div className="text-xs text-gray-400 max-w-xs truncate">{a.description}</div>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">{a.ruleCode}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={a.severity} />
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className={`text-sm font-semibold ${
                        a.riskScore >= 80
                          ? 'text-red-600'
                          : a.riskScore >= 60
                          ? 'text-orange-600'
                          : 'text-yellow-600'
                      }`}
                    >
                      {a.riskScore}
                    </span>
                    <span className="text-xs text-gray-400">/100</span>
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-400">
                    {a.dueDate ? formatDateTime(a.dueDate) : '—'}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-400">
                    {formatDateTime(a.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Compliance Cases */}
      <Card>
        <CardHeader title="Open Compliance Cases" subtitle="Active investigations and reviews" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Case</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Priority</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Subject</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && <LoadingRows cols={6} />}
              {!loading && cases.length === 0 && (
                <EmptyState message="No open compliance cases." />
              )}
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">{c.caseNumber}</td>
                  <td className="px-6 py-3 capitalize text-gray-600">
                    {c.type.replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={c.priority} />
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-6 py-3 text-gray-700 max-w-xs truncate">{c.subject}</td>
                  <td className="px-6 py-3 text-xs text-gray-400">
                    {c.dueDate ? formatDateTime(c.dueDate) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}
