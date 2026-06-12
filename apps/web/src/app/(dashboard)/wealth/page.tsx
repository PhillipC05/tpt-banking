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
import { formatCurrency, formatNumber, formatPct, formatDate } from '@/lib/format';

interface ModelPortfolio {
  id: string;
  name: string;
  riskLevel: string;
  minInvestment: number;
  description: string;
  targetAllocations: Record<string, number>;
}

interface Holding {
  symbol: string;
  name: string;
  assetClass: string;
  quantity: number;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPct: number;
}

interface RoboAccount {
  id: string;
  customerId: string;
  modelPortfolioId: string;
  status: string;
  totalValue: number;
  holdings: Holding[];
  expectedReturn: number;
  expectedVolatility: number;
  lastRebalance: string;
}

interface Performance {
  totalGains: number;
  gainsPct: number;
  ytdReturn: number;
  oneYearReturn: number;
  sharpeRatio: number;
  expectedAnnualReturn: number;
  expectedVolatility: number;
}

export default function WealthPage() {
  const [models, setModels] = useState<ModelPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<ModelPortfolio | null>(null);
  const [account, setAccount] = useState<RoboAccount | null>(null);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);

  useEffect(() => {
    apiClient
      .get<ModelPortfolio[]>('/wealth/robo-advisor/models')
      .then(({ data }) => setModels(data))
      .catch(() => setError('Failed to load wealth management data.'))
      .finally(() => setLoading(false));
  }, []);

  function loadModelDetail(model: ModelPortfolio) {
    setSelectedModel(model);
    setAccount(null);
    setPerformance(null);
    setAccountLoading(true);
    // Try to fetch accounts for this model - if none exist we just show the model details
    apiClient
      .get<RoboAccount[]>(`/wealth/robo-advisor/accounts`, {
        params: { modelPortfolioId: model.id },
      })
      .then(({ data }) => {
        if (data.length > 0) {
          setAccount(data[0]);
          return apiClient.get<Performance>(`/wealth/robo-advisor/accounts/${data[0].id}/performance`);
        }
        return null;
      })
      .then((res) => {
        if (res) setPerformance(res.data);
      })
      .catch(() => {})
      .finally(() => setAccountLoading(false));
  }

  const RISK_COLOR: Record<string, string> = {
    CONSERVATIVE: 'text-blue-700',
    MODERATE: 'text-green-700',
    BALANCED: 'text-yellow-700',
    GROWTH: 'text-orange-700',
    AGGRESSIVE: 'text-red-700',
  };

  return (
    <PageShell title="Wealth Management" description="Robo-advisor model portfolios and client accounts.">
      {error && <ErrorBanner message={error} />}

      {/* Model portfolios */}
      <Card>
        <CardHeader title="Model Portfolios" subtitle="Click a model to view account details" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Model</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Risk Level</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Min Investment</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Allocations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && <LoadingRows cols={4} />}
              {!loading && models.length === 0 && <EmptyState message="No model portfolios available." />}
              {models.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => loadModelDetail(m)}
                  className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                    selectedModel?.id === m.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="font-medium text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400 max-w-sm truncate">{m.description}</div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`text-sm font-semibold capitalize ${RISK_COLOR[m.riskLevel] ?? 'text-gray-700'}`}>
                      {m.riskLevel?.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-gray-900">
                    {formatCurrency(m.minInvestment)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(m.targetAllocations ?? {}).map(([cls, pct]) => (
                        <span key={cls} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                          {cls.replace(/_/g, ' ')}: {(pct * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Account detail */}
      {selectedModel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance metrics */}
          <Card>
            <CardHeader
              title={`Performance — ${selectedModel.name}`}
              subtitle="Account metrics"
            />
            {accountLoading && (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            )}
            {!accountLoading && !account && (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                No accounts enrolled in this model.
              </div>
            )}
            {performance && account && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <StatCard
                    label="Total Value"
                    value={formatCurrency(account.totalValue)}
                  />
                  <StatCard
                    label="Total Gains"
                    value={`${performance.gainsPct >= 0 ? '+' : ''}${formatPct(performance.gainsPct, true)}`}
                    valueColor={performance.gainsPct >= 0 ? 'text-green-600' : 'text-red-600'}
                    sub={formatCurrency(performance.totalGains)}
                  />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">YTD Return</span>
                    <span className={`font-semibold ${performance.ytdReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatPct(performance.ytdReturn, true)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">1-Year Return</span>
                    <span className={`font-semibold ${performance.oneYearReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatPct(performance.oneYearReturn, true)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Sharpe Ratio</span>
                    <span className="font-semibold text-gray-900">{formatNumber(performance.sharpeRatio)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Expected Annual Return</span>
                    <span className="font-semibold text-gray-900">{formatPct(performance.expectedAnnualReturn, true)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">Expected Volatility</span>
                    <span className="font-semibold text-gray-900">{formatPct(performance.expectedVolatility, true)}</span>
                  </div>
                </div>
                {account.lastRebalance && (
                  <p className="text-xs text-gray-400">
                    Last rebalance: {formatDate(account.lastRebalance)}
                  </p>
                )}
                <StatusBadge status={account.status} />
              </div>
            )}
          </Card>

          {/* Holdings */}
          {account && account.holdings?.length > 0 && (
            <Card>
              <CardHeader title="Holdings" subtitle={`${account.holdings.length} positions`} />
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Symbol</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Value</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {account.holdings.map((h) => (
                      <tr key={h.symbol} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-gray-900">{h.symbol}</div>
                          <div className="text-xs text-gray-400 truncate max-w-[150px]">{h.name}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-900">
                          {formatCurrency(h.currentValue)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${h.gainLoss >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {h.gainLoss >= 0 ? '+' : ''}{formatCurrency(h.gainLoss)}
                          <div className="text-xs">{formatNumber(h.gainLossPct * 100)}%</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
