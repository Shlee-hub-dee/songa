import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ROLE_HOME, type Role } from '@/lib/roles';
import {
  BlockedNotice,
  parseBlockedReason,
} from '@/components/nav/blocked-notice';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: { blocked?: string; role?: string };
};

// /dashboard is the post-login landing. With the JWT role populated, the
// middleware redirects users directly to their role home — this page is
// only reached when:
//   1. The browser was bookmarked at /dashboard (silent redirect to role home).
//   2. A legacy deep link still points at /dashboard?blocked=... — we render
//      the shared notice so the user knows why they ended up here.
export default async function DashboardIndex({ searchParams }: Props) {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true },
  });

  const role = profile?.role as Role | undefined;
  const home = role ? ROLE_HOME[role] : '/dashboard/officer';
  const reason = parseBlockedReason(searchParams.blocked);

  if (reason) {
    return (
      <main className="mx-auto max-w-md p-4 sm:p-6">
        <BlockedNotice role={role} reason={reason} />
        <div className="mt-1 flex justify-end">
          <Link
            href={home}
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90"
          >
            Go to my dashboard
          </Link>
        </div>
      </main>
    );
  }

  redirect(home);
}
