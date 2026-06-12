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
import { formatCurrency, formatNumber, formatDateTime, formatPnl } from '@/lib/format';

interface SpotRate {
  currencyPair: string;
  bid: number;
  mid: number;
  ask: number;
  timestamp: string;
}

interface DeskSummary {
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  dealCount: number;
  netExposure: Record<string, number>;
  topPairs: string[];
}

interface FxDeal {
  id: string;
  currencyPair: string;
  side: string;
  baseCurrencyAmount: string;
  counterCurrencyAmount: string;
  rate: string;
  status: string;
  settlementDate: string;
  createdAt: string;
}

export default function TreasuryPage() {
  const [rates, setRates] = useState<SpotRate[]>([]);
  const [summary, setSummary] = useState<DeskSummary | null>(null);
  const [deals, setDeals] = useState<FxDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get<SpotRate[]>('/treasury/fx-desk/rates/spot'),
      apiClient.get<DeskSummary>('/treasury/fx-desk/desk/summary'),
    ])
      .then(([ratesRes, summaryRes]) => {
        setRates(ratesRes.data);
        setSummary(summaryRes.data);
      })
      .catch(() => setError('Failed to load treasury data.'))
      .finally(() => setLoading(false));
  }, []);

  const loadBook = (pair: string) => {
    apiClient
      .get<{ openDeals: FxDeal[] }>(`/treasury/fx-desk/book`, { params: { currencyPair: pair } })
      .then(({ data }) => setDeals(data.openDeals ?? []))
      .catch(() => setDeals([]));
  };

  const totalPnlFmt = summary ? formatPnl(summary.totalPnl) : null;

  return (
    <PageShell title="Treasury" description="FX desk, spot rates, and deal book.">
      {error && <ErrorBanner message={error} />}

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total P&L"
            value={totalPnlFmt?.label ?? '—'}
            valueColor={totalPnlFmt?.positive ? 'text-green-600' : 'text-red-600'}
          />
          <StatCard
            label="Realized P&L"
            value={formatPnl(summary.realizedPnl).label}
            valueColor={formatPnl(summary.realizedPnl).positive ? 'text-green-600' : 'text-red-600'}
          />
          <StatCard
            label="Unrealized P&L"
            value={formatPnl(summary.unrealizedPnl).label}
            valueColor={formatPnl(summary.unrealizedPnl).positive ? 'text-green-600' : 'text-red-600'}
          />
          <StatCard label="Open Deals" value={summary.dealCount} />
        </div>
      )}
      {loading && !summary && (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
              <div className="h-7 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Spot Rates */}
        <Card>
          <CardHeader title="FX Spot Rates" subtitle="Click a pair to load the deal book" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Pair</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Bid</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Mid</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Ask</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Spread</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && <LoadingRows cols={5} rows={8} />}
                {!loading && rates.length === 0 && <EmptyState message="No spot rates available." />}
                {rates.map((r) => {
                  const spread = ((r.ask - r.bid) / r.mid * 10000).toFixed(1);
                  return (
                    <tr
                      key={r.currencyPair}
                      onClick={() => loadBook(r.currencyPair)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-3 font-semibold text-gray-900">{r.currencyPair}</td>
                      <td className="px-6 py-3 text-right font-mono text-red-600">{formatNumber(r.bid, 4)}</td>
                      <td className="px-6 py-3 text-right font-mono text-gray-900 font-medium">{formatNumber(r.mid, 4)}</td>
                      <td className="px-6 py-3 text-right font-mono text-green-700">{formatNumber(r.ask, 4)}</td>
                      <td className="px-6 py-3 text-xs text-gray-400">{spread} pips</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Net Exposure */}
        {summary?.netExposure && (
          <Card>
            <CardHeader title="Net Currency Exposure" subtitle="Across all open positions" />
            <div className="p-6 space-y-3">
              {Object.entries(summary.netExposure).length === 0 && (
                <p className="text-sm text-gray-400">No open exposures.</p>
              )}
              {Object.entries(summary.netExposure).map(([ccy, amt]) => {
                const pnlFmt = formatPnl(amt, ccy);
                return (
                  <div key={ccy} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{ccy}</span>
                    <span className={`text-sm font-mono font-medium ${pnlFmt.positive ? 'text-green-700' : 'text-red-600'}`}>
                      {pnlFmt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Deal book */}
      {deals.length > 0 && (
        <Card>
          <CardHeader title="Open Deals" subtitle="From selected currency pair" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Pair</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Side</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Base Amt</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Rate</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Settlement</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deals.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-semibold text-gray-800">{d.currencyPair}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-semibold ${d.side === 'BUY' ? 'text-green-700' : 'text-red-600'}`}>
                        {d.side}
                      </span>
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-6 py-3 text-right font-mono text-gray-900">
                      {formatNumber(d.baseCurrencyAmount)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-900">
                      {formatNumber(d.rate, 4)}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-400">
                      {d.settlementDate ? formatDateTime(d.settlementDate) : '—'}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-400">
                      {formatDateTime(d.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
