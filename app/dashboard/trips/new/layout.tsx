import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ROLE_HOME, canLogTrips, type Role } from '@/lib/roles';

// Server-side guard for /dashboard/trips/new.
//
// The page itself is a client component (the GPS recorder needs hooks),
// so the role check lives in this layout. Middleware blocks the same prefix
// as a second layer; the API POST has its own 403 as a third.
//
// Blocked roles are sent to their role home with ?blocked=trip-log — the
// destination page (approvals / finance / admin rates) renders an amber
// BlockedNotice banner explaining why. For REGIONAL_MANAGER this is
// /dashboard/approvals, matching the spec exactly.
export const dynamic = 'force-dynamic';

export default async function NewTripLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login?redirectedFrom=/dashboard/trips/new');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');

  const role = me.role as Role;
  if (!canLogTrips(role)) {
    const home = ROLE_HOME[role];
    redirect(`${home}?blocked=trip-log&role=${encodeURIComponent(role)}`);
  }

  return <>{children}</>;
}
