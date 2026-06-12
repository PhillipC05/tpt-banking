'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';

export function DashboardHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  const primaryRole = user?.roles?.[0]?.replace(/_/g, ' ') ?? '';

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div />
      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{user.email}</span>
            {primaryRole && (
              <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2.5 py-0.5 font-medium capitalize">
                {primaryRole}
              </span>
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
