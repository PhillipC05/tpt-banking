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
import { formatCurrency, formatNumber, formatPnl } from '@/lib/format';

interface Portfolio {
  id: string;
  portfolioCode: string;
  displayName: string;
  type: string;
  status: string;
  riskProfile: string;
  baseCurrency: string;
  totalMarketValue: string;
  totalUnrealizedPnl: string;
  dayPnl: string;
  cashBalance: string;
  benchmark: string;
}

interface Position {
  id: string;
  instrumentId: string;
  quantity: string;
  avgCost: string;
  marketValue: string;
  unrealizedPnl: string;
  dayPnl: string;
  lastMarkPrice: string;
  markCurrency: string;
  notionalValue: string;
}

interface Order {
  id: string;
  clOrdId: string;
  side: string;
  orderType: string;
  orderStatus: string;
  orderQty: string;
  cumQty: string;
  leavesQty: string;
  price: string;
  avgPx: string;
  currency: string;
  desk: string;
  transactTime: string;
}

export default function InvestmentsPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Portfolio[]>('/investment/portfolios')
      .then(({ data }) => setPortfolios(data))
      .catch(() => setError('Failed to load portfolios.'))
      .finally(() => setLoading(false));
  }, []);

  function loadPortfolioDetail(portfolio: Portfolio) {
    setSelectedPortfolio(portfolio);
    setDetailLoading(true);
    setDetailError(null);
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      apiClient.get<Position[]>(`/investment/positions/portfolio/${portfolio.id}`),
      apiClient.get<Order[]>('/investment/orders/blotter', { params: { date: today, portfolioId: portfolio.id } }),
    ])
      .then(([posRes, ordRes]) => {
        setPositions(posRes.data);
        setOrders(ordRes.data);
      })
      .catch(() => setDetailError('Failed to load portfolio details.'))
      .finally(() => setDetailLoading(false));
  }

  const totalValue = portfolios.reduce((s, p) => s + parseFloat(p.totalMarketValue || '0'), 0);
  const totalPnl = portfolios.reduce((s, p) => s + parseFloat(p.totalUnrealizedPnl || '0'), 0);
  const dayPnl = portfolios.reduce((s, p) => s + parseFloat(p.dayPnl || '0'), 0);

  const totalPnlFmt = formatPnl(totalPnl);
  const dayPnlFmt = formatPnl(dayPnl);

  return (
    <PageShell title="Investments" description="Portfolios, positions, and order blotter.">
      {error && <ErrorBanner message={error} />}

      {!loading && portfolios.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Market Value" value={formatCurrency(totalValue)} sub="all portfolios" />
          <StatCard
            label="Unrealized P&L"
            value={totalPnlFmt.label}
            valueColor={totalPnlFmt.positive ? 'text-green-600' : 'text-red-600'}
          />
          <StatCard
            label="Day P&L"
            value={dayPnlFmt.label}
            valueColor={dayPnlFmt.positive ? 'text-green-600' : 'text-red-600'}
          />
        </div>
      )}

      {/* Portfolios table */}
      <Card>
        <CardHeader title="Portfolios" subtitle="Click a portfolio to view positions and orders" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Portfolio</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Risk</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Market Value</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Unrealized P&L</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && <LoadingRows cols={7} />}
              {!loading && portfolios.length === 0 && <EmptyState message="No portfolios found." />}
              {portfolios.map((p) => {
                const pnlFmt = formatPnl(p.totalUnrealizedPnl || '0', p.baseCurrency);
                return (
                  <tr
                    key={p.id}
                    onClick={() => loadPortfolioDetail(p)}
                    className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                      selectedPortfolio?.id === p.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900">{p.displayName}</div>
                      <div className="text-xs text-gray-400">{p.portfolioCode} · {p.baseCurrency}</div>
                    </td>
                    <td className="px-6 py-3 capitalize text-gray-600">
                      {p.type.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-6 py-3 capitalize text-gray-600">
                      {p.riskProfile?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-900">
                      {formatCurrency(p.totalMarketValue || '0', p.baseCurrency)}
                    </td>
                    <td className={`px-6 py-3 text-right font-mono font-medium ${pnlFmt.positive ? 'text-green-700' : 'text-red-600'}`}>
                      {pnlFmt.label}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-600">
                      {formatCurrency(p.cashBalance || '0', p.baseCurrency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Positions */}
      {selectedPortfolio && (
        <Card>
          <CardHeader
            title={`Positions — ${selectedPortfolio.displayName}`}
            subtitle={`${selectedPortfolio.type.replace(/_/g, ' ')} · ${selectedPortfolio.baseCurrency}`}
          />
          {detailError && <div className="px-6 py-3"><ErrorBanner message={detailError} /></div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Instrument</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Qty</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Avg Cost</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Last Price</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Market Value</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Unrealized P&L</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Day P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {detailLoading && <LoadingRows cols={7} />}
                {!detailLoading && positions.length === 0 && (
                  <EmptyState message="No positions in this portfolio." />
                )}
                {positions.map((pos) => {
                  const pnlFmt = formatPnl(pos.unrealizedPnl || '0', pos.markCurrency);
                  const dayFmt = formatPnl(pos.dayPnl || '0', pos.markCurrency);
                  return (
                    <tr key={pos.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-mono text-xs text-gray-600">{pos.instrumentId}</td>
                      <td className="px-6 py-3 text-right font-mono text-gray-900">
                        {formatNumber(pos.quantity, 0)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-600">
                        {formatNumber(pos.avgCost)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-900">
                        {formatNumber(pos.lastMarkPrice)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-900">
                        {formatCurrency(pos.marketValue || '0', pos.markCurrency)}
                      </td>
                      <td className={`px-6 py-3 text-right font-mono font-medium ${pnlFmt.positive ? 'text-green-700' : 'text-red-600'}`}>
                        {pnlFmt.label}
                      </td>
                      <td className={`px-6 py-3 text-right font-mono ${dayFmt.positive ? 'text-green-600' : 'text-red-500'}`}>
                        {dayFmt.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Orders */}
      {selectedPortfolio && (
        <Card>
          <CardHeader
            title={`Order Blotter — ${selectedPortfolio.displayName}`}
            subtitle="Today's orders"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Order ID</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Side</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Qty</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Filled</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Avg Px</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Desk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {detailLoading && <LoadingRows cols={8} />}
                {!detailLoading && orders.length === 0 && (
                  <EmptyState message="No orders today for this portfolio." />
                )}
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">{o.clOrdId}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          o.side === 'BUY' ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {o.side}
                      </span>
                    </td>
                    <td className="px-6 py-3 capitalize text-gray-600">
                      {o.orderType?.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={o.orderStatus} />
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-900">
                      {formatNumber(o.orderQty, 0)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-600">
                      {formatNumber(o.cumQty, 0)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-900">
                      {o.avgPx ? formatNumber(o.avgPx) : '—'}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-400">{o.desk ?? '—'}</td>
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
