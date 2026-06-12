'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/banking', label: 'Banking' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/investments', label: 'Investments' },
  { href: '/treasury', label: 'Treasury' },
  { href: '/wealth', label: 'Wealth' },
  { href: '/risk', label: 'Risk' },
  { href: '/regulatory', label: 'Regulatory' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-white flex flex-col">
      <div className="px-5 py-4 border-b border-gray-700">
        <span className="text-base font-bold tracking-tight">TPT Banking</span>
        <p className="text-xs text-gray-400 mt-0.5">Platform</p>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_LINKS.map((link) => {
          const isActive =
            link.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
