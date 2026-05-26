import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { Button } from '@/components/ui/button';

// Sticky header for every /dashboard/* page. Shows the Songa wordmark, the
// signed-in user's name + role, and a sign-out button. Middleware already
// gates this layout — if it ever renders without a user we degrade gracefully.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await getAuthedUser();

  // Pull the local profile so we can show the friendly name + role.
  // Falls back silently if the auth user has no matching row yet.
  let profile: { name: string; role: string } | null = null;
  if (authUser) {
    profile = await prisma.user.findUnique({
      where: { supabaseUserId: authUser.id },
      select: { name: true, role: true },
    });
  }

  const displayName = profile?.name ?? authUser?.email ?? '';
  const roleLabel = profile?.role ? (ROLE_LABEL[profile.role as Role] ?? '') : '';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
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
            {roleLabel ? (
              <span className="hidden rounded-full bg-brand-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand tablet:inline-block">
                {roleLabel}
              </span>
            ) : null}
          </Link>

          <div className="flex items-center gap-3">
            {displayName ? (
              <span
                className="hidden max-w-[180px] truncate text-sm text-muted-foreground tablet:inline"
                title={displayName}
              >
                {displayName}
              </span>
            ) : null}
            {authUser ? (
              // <form> + native POST means sign-out works even when JS is
              // throttled or the SW intercepts the navigation.
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

      {children}
    </div>
  );
}
