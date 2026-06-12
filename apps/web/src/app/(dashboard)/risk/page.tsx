'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
import {
  PageShell,
  Card,
  CardHeader,
  ErrorBanner,
  StatCard,
} from '@/components/PageShell';
import { formatCurrency, formatNumber, formatPct } from '@/lib/format';

interface VarResult {
  var: number;
  cvar: number;
  confidenceLevel: number;
  holdingPeriod: number;
  portfolioValue: number;
  method: string;
  volatility?: number;
  expectedReturn?: number;
}

interface MonteCarloResult {
  var: number;
  cvar: number;
  portfolioVar: number;
  portfolioCvar: number;
  simulationCount: number;
  diversificationBenefit: number;
  method: string;
  confidenceLevel: number;
  componentVar: Record<string, number>;
}

type Method = 'historical' | 'parametric' | 'monte-carlo';

const DEFAULT_POSITIONS = `[
  { "symbol": "AAPL", "weight": 0.30, "returns": [-0.02, 0.01, 0.015, -0.005, 0.02] },
  { "symbol": "MSFT", "weight": 0.25, "returns": [-0.01, 0.02, 0.01, -0.008, 0.018] },
  { "symbol": "AMZN", "weight": 0.20, "returns": [-0.03, 0.025, 0.008, -0.012, 0.022] },
  { "symbol": "GOOGL", "weight": 0.15, "returns": [-0.015, 0.012, 0.02, -0.006, 0.016] },
  { "symbol": "NVDA", "weight": 0.10, "returns": [-0.04, 0.035, 0.03, -0.02, 0.04] }
]`;

export default function RiskPage() {
  const [method, setMethod] = useState<Method>('parametric');
  const [portfolioValue, setPortfolioValue] = useState('1000000');
  const [confidenceLevel, setConfidenceLevel] = useState('0.95');
  const [holdingPeriod, setHoldingPeriod] = useState('1');
  const [volatility, setVolatility] = useState('0.015');
  const [expectedReturn, setExpectedReturn] = useState('0.0003');
  const [positionsJson, setPositionsJson] = useState(DEFAULT_POSITIONS);
  const [positionsError, setPositionsError] = useState<string | null>(null);

  const [result, setResult] = useState<VarResult | MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calculate() {
    setError(null);
    setPositionsError(null);
    setLoading(true);
    try {
      let payload: Record<string, unknown> = {
        portfolioValue: parseFloat(portfolioValue),
        confidenceLevel: parseFloat(confidenceLevel),
        holdingPeriod: parseInt(holdingPeriod, 10),
      };

      if (method === 'parametric') {
        payload = { ...payload, volatility: parseFloat(volatility), expectedReturn: parseFloat(expectedReturn) };
        const { data } = await apiClient.post<VarResult>('/risk/var/parametric', payload);
        setResult(data);
      } else if (method === 'historical') {
        let positions;
        try {
          positions = JSON.parse(positionsJson);
        } catch {
          setPositionsError('Invalid JSON for positions.');
          return;
        }
        payload = { ...payload, positions };
        const { data } = await apiClient.post<VarResult>('/risk/var/historical', payload);
        setResult(data);
      } else {
        let positions;
        try {
          positions = JSON.parse(positionsJson);
        } catch {
          setPositionsError('Invalid JSON for positions.');
          return;
        }
        payload = { ...payload, positions, simulations: 10000 };
        const { data } = await apiClient.post<MonteCarloResult>('/risk/var/monte-carlo', payload);
        setResult(data);
      }
    } catch {
      setError('VaR calculation failed. Check your inputs and ensure the risk-analytics service is running.');
    } finally {
      setLoading(false);
    }
  }

  const isMonteCarlo = (r: VarResult | MonteCarloResult | null): r is MonteCarloResult =>
    !!r && 'simulationCount' in r;

  return (
    <PageShell
      title="Risk Analytics"
      description="Value at Risk (VaR) and portfolio risk calculations."
    >
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input panel */}
        <Card className="lg:col-span-1">
          <CardHeader title="VaR Parameters" />
          <div className="p-6 space-y-4">
            {/* Method selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
              <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-lg">
                {(['parametric', 'historical', 'monte-carlo'] as Method[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
                      method === m
                        ? 'bg-white shadow text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {m === 'monte-carlo' ? 'Monte Carlo' : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Portfolio Value ($)</label>
              <input
                type="number"
                value={portfolioValue}
                onChange={(e) => setPortfolioValue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confidence Level</label>
              <select
                value={confidenceLevel}
                onChange={(e) => setConfidenceLevel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="0.90">90%</option>
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Holding Period (days)</label>
              <input
                type="number"
                min="1"
                value={holdingPeriod}
                onChange={(e) => setHoldingPeriod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {method === 'parametric' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Daily Volatility</label>
                  <input
                    type="number"
                    step="0.001"
                    value={volatility}
                    onChange={(e) => setVolatility(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 0.015"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Daily Expected Return</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 0.0003"
                  />
                </div>
              </>
            )}

            {(method === 'historical' || method === 'monte-carlo') && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Positions (JSON)
                </label>
                <textarea
                  rows={8}
                  value={positionsJson}
                  onChange={(e) => setPositionsJson(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                    positionsError ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {positionsError && (
                  <p className="text-xs text-red-600 mt-1">{positionsError}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Each item: symbol, weight, returns (array of daily returns).
                </p>
              </div>
            )}

            <button
              onClick={calculate}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Calculating…' : 'Calculate VaR'}
            </button>
          </div>
        </Card>

        {/* Results panel */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !loading && (
            <Card>
              <div className="px-6 py-12 text-center text-sm text-gray-400">
                Configure parameters and click Calculate VaR to see results.
              </div>
            </Card>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label={`VaR (${(parseFloat(confidenceLevel) * 100).toFixed(0)}%, ${holdingPeriod}d)`}
                  value={formatCurrency(result.var)}
                  sub={`${formatPct(result.var / parseFloat(portfolioValue), true)} of portfolio`}
                  valueColor="text-red-600"
                />
                <StatCard
                  label="CVaR (Expected Shortfall)"
                  value={formatCurrency(result.cvar)}
                  sub={`${formatPct(result.cvar / parseFloat(portfolioValue), true)} of portfolio`}
                  valueColor="text-red-700"
                />
                {isMonteCarlo(result) && (
                  <>
                    <StatCard
                      label="Portfolio VaR"
                      value={formatCurrency(result.portfolioVar)}
                    />
                    <StatCard
                      label="Diversification Benefit"
                      value={formatCurrency(result.diversificationBenefit)}
                      valueColor="text-green-600"
                    />
                  </>
                )}
              </div>

              <Card>
                <CardHeader title="Calculation Details" subtitle={result.method} />
                <div className="p-6 space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Method</span>
                    <span className="font-medium text-gray-900">{result.method}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Portfolio Value</span>
                    <span className="font-mono text-gray-900">{formatCurrency(result.portfolioValue)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Confidence Level</span>
                    <span className="font-mono text-gray-900">{(result.confidenceLevel * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Holding Period</span>
                    <span className="font-mono text-gray-900">{result.holdingPeriod} days</span>
                  </div>
                  {!isMonteCarlo(result) && result.volatility && (
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500">Volatility</span>
                      <span className="font-mono text-gray-900">{formatPct(result.volatility, true)}</span>
                    </div>
                  )}
                  {isMonteCarlo(result) && (
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">Simulations</span>
                      <span className="font-mono text-gray-900">
                        {formatNumber(result.simulationCount, 0)}
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              {isMonteCarlo(result) && Object.keys(result.componentVar).length > 0 && (
                <Card>
                  <CardHeader title="Component VaR" subtitle="Contribution of each position" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left">
                          <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Position</th>
                          <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Component VaR</th>
                          <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">% of Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {Object.entries(result.componentVar).map(([pos, varVal]) => (
                          <tr key={pos} className="hover:bg-gray-50">
                            <td className="px-6 py-3 font-semibold text-gray-800">{pos}</td>
                            <td className="px-6 py-3 text-right font-mono text-red-600">
                              {formatCurrency(varVal)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-gray-500">
                              {formatPct(varVal / result.portfolioVar, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
