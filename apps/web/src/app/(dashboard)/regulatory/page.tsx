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
import { formatNumber, formatPct, formatDate } from '@/lib/format';

interface CapitalAdequacy {
  cet1Ratio: number;
  tier1Ratio: number;
  totalCapitalRatio: number;
  leverageRatio: number;
  cet1Capital: number;
  tier1Capital: number;
  totalCapital: number;
  riskWeightedAssets: number;
  cet1Minimum: number;
  cet1Buffer: number;
  pass: boolean;
  reportDate: string;
  reportingMethod: string;
}

const DEFAULT_INPUTS = {
  cet1Capital: 5000000000,
  additionalTier1Capital: 500000000,
  tier2Capital: 800000000,
  riskWeightedAssets: 45000000000,
  totalExposure: 60000000000,
  gSibSurcharge: 0,
  reportDate: new Date().toISOString().split('T')[0],
  reportingMethod: 'Basel III',
};

export default function RegulatoryPage() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [result, setResult] = useState<CapitalAdequacy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateInput(key: keyof typeof DEFAULT_INPUTS, value: string) {
    setInputs((prev) => ({
      ...prev,
      [key]: key === 'reportDate' || key === 'reportingMethod' ? value : parseFloat(value) || 0,
    }));
  }

  async function calculate() {
    setError(null);
    setLoading(true);
    try {
      const { data } = await apiClient.post<CapitalAdequacy>(
        '/regulatory/basel/capital-adequacy',
        inputs,
      );
      setResult(data);
    } catch {
      setError('Capital adequacy calculation failed. Ensure the regulatory-reporting service is running.');
    } finally {
      setLoading(false);
    }
  }

  const RATIO_MINIMUMS: Record<string, number> = {
    cet1Ratio: 4.5,
    tier1Ratio: 6.0,
    totalCapitalRatio: 8.0,
    leverageRatio: 3.0,
  };

  function ratioStatus(ratio: number, key: string): string {
    const min = RATIO_MINIMUMS[key];
    if (!min) return 'text-gray-900';
    if (ratio >= min + 2) return 'text-green-700';
    if (ratio >= min) return 'text-yellow-700';
    return 'text-red-600';
  }

  const CURRENCY_FIELDS: { key: keyof typeof DEFAULT_INPUTS; label: string }[] = [
    { key: 'cet1Capital', label: 'CET1 Capital' },
    { key: 'additionalTier1Capital', label: 'Additional Tier 1 Capital' },
    { key: 'tier2Capital', label: 'Tier 2 Capital' },
    { key: 'riskWeightedAssets', label: 'Risk-Weighted Assets' },
    { key: 'totalExposure', label: 'Total Exposure (Leverage)' },
  ];

  return (
    <PageShell
      title="Regulatory Reporting"
      description="Basel III/IV capital adequacy ratios and regulatory metrics."
    >
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input panel */}
        <Card className="lg:col-span-1">
          <CardHeader title="Balance Sheet Inputs" />
          <div className="p-6 space-y-4">
            {CURRENCY_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="number"
                  value={inputs[key] as number}
                  onChange={(e) => updateInput(key, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">G-SIB Surcharge (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="3.5"
                value={inputs.gSibSurcharge}
                onChange={(e) => updateInput('gSibSurcharge', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
              <select
                value={inputs.reportingMethod}
                onChange={(e) => updateInput('reportingMethod', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Basel III">Basel III</option>
                <option value="Basel IV">Basel IV</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Report Date</label>
              <input
                type="date"
                value={inputs.reportDate}
                onChange={(e) => updateInput('reportDate', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={calculate}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Calculating…' : 'Calculate Ratios'}
            </button>
          </div>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !loading && (
            <Card>
              <div className="px-6 py-12 text-center text-sm text-gray-400">
                Enter balance sheet data and calculate to see Basel capital ratios.
              </div>
            </Card>
          )}

          {result && (
            <>
              {/* Overall pass/fail banner */}
              <div
                className={`rounded-xl border p-4 flex items-center gap-3 ${
                  result.pass
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <span
                  className={`text-2xl font-bold ${result.pass ? 'text-green-700' : 'text-red-600'}`}
                >
                  {result.pass ? '✓ PASS' : '✗ FAIL'}
                </span>
                <div>
                  <p className={`text-sm font-medium ${result.pass ? 'text-green-800' : 'text-red-700'}`}>
                    {result.reportingMethod} Capital Adequacy Assessment
                  </p>
                  <p className={`text-xs ${result.pass ? 'text-green-600' : 'text-red-500'}`}>
                    Report date: {formatDate(result.reportDate)}
                  </p>
                </div>
              </div>

              {/* Capital ratios */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'CET1 Ratio', value: result.cet1Ratio, key: 'cet1Ratio', min: 4.5 },
                  { label: 'Tier 1 Ratio', value: result.tier1Ratio, key: 'tier1Ratio', min: 6.0 },
                  { label: 'Total Capital Ratio', value: result.totalCapitalRatio, key: 'totalCapitalRatio', min: 8.0 },
                  { label: 'Leverage Ratio', value: result.leverageRatio, key: 'leverageRatio', min: 3.0 },
                ].map(({ label, value, key, min }) => (
                  <StatCard
                    key={key}
                    label={label}
                    value={formatPct(value, true)}
                    sub={`Min: ${min}% · Buffer: ${formatPct(value - min, true)}`}
                    valueColor={ratioStatus(value, key)}
                  />
                ))}
              </div>

              {/* Capital breakdown */}
              <Card>
                <CardHeader title="Capital Breakdown" subtitle="In millions USD" />
                <div className="p-6 space-y-2 text-sm">
                  {[
                    { label: 'CET1 Capital', value: result.cet1Capital },
                    { label: 'Tier 1 Capital', value: result.tier1Capital },
                    { label: 'Total Regulatory Capital', value: result.totalCapital },
                    { label: 'Risk-Weighted Assets', value: result.riskWeightedAssets },
                    { label: 'CET1 Minimum Requirement', value: result.cet1Minimum },
                    { label: 'CET1 Buffer (Surplus)', value: result.cet1Buffer },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-mono font-medium text-gray-900">
                        ${formatNumber(value / 1_000_000, 0)}M
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Minimum requirements reference */}
              <Card>
                <CardHeader title="Regulatory Minimums" subtitle={result.reportingMethod} />
                <div className="p-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="pb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Ratio</th>
                        <th className="pb-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Minimum</th>
                        <th className="pb-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Actual</th>
                        <th className="pb-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        { name: 'CET1', min: 4.5, actual: result.cet1Ratio },
                        { name: 'Tier 1', min: 6.0, actual: result.tier1Ratio },
                        { name: 'Total Capital', min: 8.0, actual: result.totalCapitalRatio },
                        { name: 'Leverage', min: 3.0, actual: result.leverageRatio },
                      ].map((r) => (
                        <tr key={r.name}>
                          <td className="py-2 text-gray-700">{r.name}</td>
                          <td className="py-2 text-right font-mono text-gray-500">{r.min}%</td>
                          <td className={`py-2 text-right font-mono font-medium ${r.actual >= r.min ? 'text-green-700' : 'text-red-600'}`}>
                            {formatPct(r.actual, true)}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-xs font-medium ${r.actual >= r.min ? 'text-green-700' : 'text-red-600'}`}>
                              {r.actual >= r.min ? '✓' : '✗'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
