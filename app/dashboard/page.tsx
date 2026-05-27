import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAuthUser, getCurrentUser } from '@/lib/current-user';
import { ROLE_HOME } from '@/lib/roles';
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
//   3. The user is authed in Supabase but has no public.users row (or it's
//      not linked via supabase_user_id). Bouncing them to /login would just
//      loop because the Supabase session is still valid, so we render a
//      terminal "not provisioned" message instead.
export default async function DashboardIndex({ searchParams }: Props) {
  const [authUser, me] = await Promise.all([
    getCurrentAuthUser(),
    getCurrentUser(),
  ]);
  if (!authUser) redirect('/login');

  // Authed but the public.users row is missing or unlinked. This is the
  // case that used to redirect-loop into a 429 from Supabase Auth.
  if (!me) {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h1 className="text-lg font-semibold text-amber-900">
            Account not provisioned
          </h1>
          <p className="mt-2 text-sm text-amber-900/80">
            You&apos;re signed in as{' '}
            <span className="font-mono">{authUser.email}</span>, but no Songa
            profile is linked to this account yet. Please contact your admin
            so they can finish setting it up.
          </p>
          <form action="/api/auth/signout" method="post" className="mt-4">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md border border-amber-300 bg-white px-4 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const role = me.role;
  const home = ROLE_HOME[role] ?? '/dashboard/officer';
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
