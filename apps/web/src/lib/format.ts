export function formatCurrency(amount: string | number, currency = 'USD'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

export function formatNumber(num: string | number, decimals = 2): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatPct(num: string | number, alreadyPct = false): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  const val = alreadyPct ? n : n * 100;
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPnl(num: string | number, currency = 'USD'): { label: string; positive: boolean } {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  return {
    label: `${n >= 0 ? '+' : ''}${formatCurrency(Math.abs(n), currency)}`,
    positive: n >= 0,
  };
}
