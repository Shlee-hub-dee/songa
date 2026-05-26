import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ROLE_HOME, ROLE_LABEL, type Role } from '@/lib/roles';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: { blocked?: string; role?: string };
};

export default async function DashboardIndex({ searchParams }: Props) {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, name: true },
  });

  const role = profile?.role as Role | undefined;
  const home = role ? ROLE_HOME[role] : '/dashboard/officer';

  // Middleware redirected here because the user tried to reach /dashboard/trips/new
  // with a role that can't log trips. Render the notice and offer a clear way
  // back to where they should be.
  if (searchParams.blocked === 'trip-log') {
    const blockedRoleLabel =
      role ? ROLE_LABEL[role] : (searchParams.role ?? 'your role');
    return (
      <main className="mx-auto max-w-md p-4 sm:p-6">
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
            Action not available
          </p>
          <h1 className="mt-1 text-lg font-bold text-amber-900">
            Trip logging is restricted for {blockedRoleLabel}s
          </h1>
          <p className="mt-2 text-sm text-amber-900/90">
            Trip recording is reserved for Tupande Agents, Zone Supervisors, and
            Area Coordinators. Your role&apos;s focus is on approvals, disbursements,
            or system management.
          </p>
          <div className="mt-4">
            <Link
              href={home}
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90"
            >
              Go to my dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  redirect(home);
}
