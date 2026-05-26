import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { canLogTrips, type Role } from '@/lib/roles';

// Server-side guard for /dashboard/trips/new.
//
// The route itself is a client component (the GPS recorder needs hooks),
// so the role check lives in this layout — the layout runs on every nested
// request and is the right place to enforce "only logging-allowed roles get
// past this point". Middleware blocks the same prefix as a second layer.
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

  if (!canLogTrips(me.role as Role)) {
    // Hand off to /dashboard which renders the "action not available" notice
    // and a link back to the user's role home.
    redirect(`/dashboard?blocked=trip-log&role=${encodeURIComponent(me.role)}`);
  }

  return <>{children}</>;
}
