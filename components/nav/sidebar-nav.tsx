'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_BY_ROLE, type NavItem } from '@/lib/nav';
import type { Role } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { NavIcon } from './nav-icon';

// Sidebar shown at lg+ (1024px+). At smaller widths the layout swaps in the
// bottom nav instead — both render the same items from NAV_BY_ROLE so the
// mobile/desktop experiences stay in sync.

export function SidebarNav({ role }: { role: Role }) {
  const items = NAV_BY_ROLE[role] ?? [];
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="flex flex-col gap-1 p-3">
      {items.map((item) => (
        <SidebarItem key={`${item.href}-${item.label}`} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

function SidebarItem({ item, pathname }: { item: NavItem; pathname: string }) {
  // The href can carry a hash ("/dashboard/officer#trips"); strip it for the
  // active-state check so #trips and the bare overview row don't both light up.
  const hrefPath = item.href.split('#')[0];
  const itemHash = item.href.split('#')[1];
  // Active if the current path matches the bare href AND (this item has no hash
  // OR is the only item at this href). Since we can't read the URL fragment
  // server-side, hash-targeted items don't get an "active" highlight — that's
  // an acceptable trade-off for v1.
  const isActive =
    !itemHash &&
    (pathname === hrefPath ||
      (hrefPath !== '/dashboard' && pathname.startsWith(`${hrefPath}/`)));

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-brand text-white'
          : 'text-foreground/70 hover:bg-brand-surface hover:text-brand',
      )}
    >
      <NavIcon name={item.icon} className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
