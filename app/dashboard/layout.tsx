import Image from 'next/image';
import Link from 'next/link';
import { getCurrentUser, getCurrentAuthUser } from '@/lib/current-user';
import { ROLE_LABEL } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { SidebarNav } from '@/components/nav/sidebar-nav';
import { BottomNav } from '@/components/nav/bottom-nav';
import { NotificationBell } from '@/components/nav/notification-bell';

// Dashboard frame: sticky top nav + role-aware sidebar (lg+) or bottom nav
// (<lg). The Prisma-backed `role` is the source of truth for nav items —
// not the JWT role claim — so role changes take effect on next page load
// without needing the user to sign out and back in.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both calls are React-cached so the page that renders inside this layout
  // can call them again and they'll be deduped within this request.
  const [me, authUser] = await Promise.all([
    getCurrentUser(),
    getCurrentAuthUser(),
  ]);

  const displayName = me?.name ?? authUser?.email ?? '';
  const role = me?.role ?? null;
  const roleLabel = role ? ROLE_LABEL[role] : '';

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top nav ── */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left: logo + wordmark */}
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image
              src="/tupande-logo.jpg"
              alt="Tupande"
              width={240}
              height={135}
              priority
              className="h-auto w-20 rounded-md tablet:w-[120px]"
            />
            <span className="text-base font-bold tracking-tight text-brand">Songa</span>
          </Link>

          {/* Right: user, role badge, notifications, sign-out */}
          <div className="flex items-center gap-2 sm:gap-3">
            {displayName ? (
              <div className="hidden flex-col items-end leading-tight tablet:flex">
                <span
                  className="max-w-[200px] truncate text-sm font-medium text-foreground"
                  title={displayName}
                >
                  {displayName}
                </span>
                {roleLabel ? (
                  <span className="text-[11px] text-muted-foreground">{roleLabel}</span>
                ) : null}
              </div>
            ) : null}
            {roleLabel ? (
              <span className="hidden rounded-full bg-brand-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand sm:inline-block tablet:hidden">
                {roleLabel}
              </span>
            ) : null}
            <NotificationBell />
            {authUser ? (
              // <form> + native POST means sign-out survives a flaky SW/JS run.
              <form action="/api/auth/signout" method="post">
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-sm"
                >
                  Sign out
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── Sidebar (lg+) ── */}
      {role ? (
        <aside
          aria-label="Sidebar"
          className="fixed bottom-0 left-0 top-14 z-20 hidden w-60 overflow-y-auto border-r bg-card lg:block"
        >
          <SidebarNav role={role} />
        </aside>
      ) : null}

      {/* ── Main content area ── */}
      {/* lg:pl-60 offsets for the fixed sidebar; pb-20 lg:pb-0 leaves room for
          the mobile bottom-nav bar. Pages provide their own max-width / padding
          inside this region. */}
      <main className="pb-20 lg:pb-0 lg:pl-60">{children}</main>

      {/* ── Bottom nav (< lg) ── */}
      {role ? <BottomNav role={role} /> : null}
    </div>
  );
}
