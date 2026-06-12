'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
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
import { formatCurrency, formatDateTime } from '@/lib/format';

interface Account {
  id: string;
  accountNumber: string;
  customerId: string;
  type: string;
  status: string;
  currency: string;
  balance: string;
  availableBalance: string;
  holdAmount: string;
  openedAt: string;
}

interface Transaction {
  id: string;
  transactionNumber: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  description: string;
  fee: string;
  completedAt: string;
  createdAt: string;
}

export default function BankingPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(0);

  useEffect(() => {
    if (!user?.sub) return;
    apiClient
      .get<Account[]>(`/banking/accounts/customer/${user.sub}`)
      .then(({ data }) => setAccounts(data))
      .catch(() => setAccountsError('Failed to load accounts.'))
      .finally(() => setLoadingAccounts(false));
  }, [user?.sub]);

  function loadTransactions(account: Account, page = 0) {
    setSelectedAccount(account);
    setLoadingTx(true);
    setTxError(null);
    setTxPage(page);
    apiClient
      .get<Transaction[]>(`/banking/accounts/${account.id}/transactions`, {
        params: { page, limit: 20 },
      })
      .then(({ data }) => setTransactions(data))
      .catch(() => setTxError('Failed to load transactions.'))
      .finally(() => setLoadingTx(false));
  }

  const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance), 0);
  const totalAvailable = accounts.reduce((s, a) => s + parseFloat(a.availableBalance), 0);

  return (
    <PageShell title="Banking" description="Your accounts and transaction history.">
      {accountsError && <ErrorBanner message={accountsError} />}

      {/* Summary stats */}
      {!loadingAccounts && accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Accounts" value={accounts.length} sub="active accounts" />
          <StatCard
            label="Total Balance"
            value={formatCurrency(totalBalance)}
            sub="across all accounts"
          />
          <StatCard
            label="Available"
            value={formatCurrency(totalAvailable)}
            sub="funds available"
          />
        </div>
      )}

      {/* Accounts table */}
      <Card>
        <CardHeader
          title="Accounts"
          subtitle="Click an account to view its transactions"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Account
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Type
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">
                  Balance
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">
                  Available
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">
                  On Hold
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loadingAccounts && <LoadingRows cols={6} />}
              {!loadingAccounts && accounts.length === 0 && (
                <EmptyState message="No accounts found." />
              )}
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => loadTransactions(a)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50 ${
                    selectedAccount?.id === a.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="font-medium text-gray-900">{a.accountNumber}</div>
                    <div className="text-xs text-gray-400">{a.currency}</div>
                  </td>
                  <td className="px-6 py-3 text-gray-600 capitalize">
                    {a.type.replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-gray-900">
                    {formatCurrency(a.balance, a.currency)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-green-700">
                    {formatCurrency(a.availableBalance, a.currency)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-orange-600">
                    {formatCurrency(a.holdAmount, a.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Transactions panel */}
      {selectedAccount && (
        <Card>
          <CardHeader
            title={`Transactions — ${selectedAccount.accountNumber}`}
            subtitle={`${selectedAccount.type.replace(/_/g, ' ')} · ${selectedAccount.currency}`}
          />
          {txError && <div className="px-6 py-3"><ErrorBanner message={txError} /></div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Description
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingTx && <LoadingRows cols={6} />}
                {!loadingTx && transactions.length === 0 && (
                  <EmptyState message="No transactions found for this account." />
                )}
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">
                      {tx.transactionNumber}
                    </td>
                    <td className="px-6 py-3 text-gray-600 capitalize">
                      {tx.type.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-6 py-3 text-gray-600 max-w-xs truncate">
                      {tx.description || '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-medium text-gray-900">
                      {formatCurrency(tx.amount, tx.currency)}
                      {parseFloat(tx.fee) > 0 && (
                        <span className="ml-1 text-xs text-gray-400">
                          +{formatCurrency(tx.fee, tx.currency)} fee
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-400">
                      {formatDateTime(tx.completedAt ?? tx.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loadingTx && transactions.length === 20 && (
            <div className="px-6 py-3 border-t border-gray-100 flex gap-2">
              {txPage > 0 && (
                <button
                  onClick={() => loadTransactions(selectedAccount, txPage - 1)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  ← Previous
                </button>
              )}
              <button
                onClick={() => loadTransactions(selectedAccount, txPage + 1)}
                className="text-sm text-blue-600 hover:underline ml-auto"
              >
                Next →
              </button>
            </div>
          )}
        </Card>
      )}
    </PageShell>
  );
}
