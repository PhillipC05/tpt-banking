const COLOR_MAP: Record<string, string> = {
  // Generic
  active: 'bg-green-100 text-green-800',
  ok: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  approved: 'bg-green-100 text-green-800',
  settled: 'bg-green-100 text-green-800',
  filled: 'bg-green-100 text-green-800',
  confirmed: 'bg-green-100 text-green-800',
  executed: 'bg-green-100 text-green-800',
  pass: 'bg-green-100 text-green-800',

  pending: 'bg-yellow-100 text-yellow-800',
  pending_new: 'bg-yellow-100 text-yellow-800',
  initiated: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-yellow-100 text-yellow-800',
  partially_filled: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  under_investigation: 'bg-yellow-100 text-yellow-800',
  open: 'bg-blue-100 text-blue-800',
  new: 'bg-blue-100 text-blue-800',
  escalated: 'bg-orange-100 text-orange-800',
  degraded: 'bg-orange-100 text-orange-800',

  failed: 'bg-red-100 text-red-800',
  declined: 'bg-red-100 text-red-800',
  rejected: 'bg-red-100 text-red-800',
  down: 'bg-red-100 text-red-800',
  frozen: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-600',

  // Severity
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
};

interface Props {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: Props) {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  const color = COLOR_MAP[key] ?? 'bg-gray-100 text-gray-600';
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {label}
    </span>
  );
}
