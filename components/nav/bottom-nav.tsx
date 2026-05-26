'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_BY_ROLE, type NavItem } from '@/lib/nav';
import type { Role } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { NavIcon } from './nav-icon';

// Bottom nav rendered below lg (i.e. phone + tablet, up to 1023px).
// Items overflow horizontally if a role has more than ~5 (e.g. ADMIN has 6).
// The leftmost items stay visible without scrolling on a 375px viewport
// because they're flex-shrink-0 + min-width sized to fit ~4 per screen.

export function BottomNav({ role }: { role: Role }) {
  const items = NAV_BY_ROLE[role] ?? [];
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex overflow-x-auto">
        {items.map((item) => (
          <BottomNavItem
            key={`${item.href}-${item.label}`}
            item={item}
            pathname={pathname}
          />
        ))}
      </ul>
    </nav>
  );
}

function BottomNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const hrefPath = item.href.split('#')[0];
  const itemHash = item.href.split('#')[1];
  const isActive =
    !itemHash &&
    (pathname === hrefPath ||
      (hrefPath !== '/dashboard' && pathname.startsWith(`${hrefPath}/`)));

  return (
    <li className="flex-1 min-w-[5rem]">
      <Link
        href={item.href}
        className={cn(
          'flex h-14 flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-medium transition-colors',
          isActive
            ? 'text-brand'
            : 'text-muted-foreground hover:text-brand',
        )}
      >
        <NavIcon name={item.icon} className="h-5 w-5" aria-hidden />
        <span className="truncate leading-tight">{item.label}</span>
      </Link>
    </li>
  );
}
