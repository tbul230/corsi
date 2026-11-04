'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/methodology', 'Method'],
  ['/results', 'Results'],
  ['/dashboard', 'Progress']
] as const;

export default function NavLinks() {
  const path = usePathname();
  return (
    <div className="flex items-center gap-1 text-sm">
      {LINKS.map(([href, label]) => {
        const active = path === href || (href === '/dashboard' && (path.startsWith('/session') || path === '/select'));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-all duration-300 sm:px-3 ${active ? 'bg-white/10 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]' : 'text-ink-2 hover:bg-white/5 hover:text-ink'}`}>
            {label}
          </Link>
        );
      })}
    </div>
  );
}
