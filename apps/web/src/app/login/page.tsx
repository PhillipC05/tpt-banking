'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';
  const justRegistered = searchParams.get('registered') === 'true';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password, totpCode: totpCode || undefined });
      router.push(next);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Login failed. Check your credentials.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
          <p className="text-sm text-gray-500 mt-1">TPT Banking Platform</p>
        </div>

        {justRegistered && (
          <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
            Account created. You can now sign in.
          </p>
        )}

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              MFA code{' '}
              <span className="text-gray-400 font-normal">(if enabled)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-600 hover:underline font-medium">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
