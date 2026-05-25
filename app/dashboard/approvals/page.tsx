import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { ClaimCard } from './_components/claim-card';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { id: true, role: true, isActive: true, name: true },
  });
  if (!me || !me.isActive) redirect('/login');

  const trips = await prisma.trip.findMany({
    where: {
      status: 'PENDING',
      user: { managerId: me.id },
    },
    select: {
      id: true,
      type: true,
      distanceKm: true,
      amountKes: true,
      gpsPointCount: true,
      submittedAt: true,
      user: { select: { id: true, name: true, region: true } },
      payment: {
        select: {
          id: true,
          mpesaRef: true,
          amountKes: true,
          screenshotPath: true,
        },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 tablet:max-w-5xl">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Approvals</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Pending claims</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {trips.length === 0
            ? 'Nothing waiting on you right now.'
            : `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'} from your team awaiting review.`}
        </p>
      </header>

      {trips.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          When officers on your team submit trips, they&apos;ll appear here.
        </div>
      ) : (
        <ul className="grid gap-3 tablet:grid-cols-2">
          {trips.map((t) => (
            <li key={t.id}>
              <ClaimCard
                claim={{
                  id: t.id,
                  typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
                  distanceKm: Number(t.distanceKm),
                  amountKes: Number(t.amountKes),
                  waypointCount: t.gpsPointCount,
                  submittedAt: t.submittedAt?.toISOString() ?? null,
                  officer: {
                    id: t.user.id,
                    name: t.user.name,
                    region: t.user.region,
                  },
                  payment: t.payment
                    ? {
                        mpesaRef: t.payment.mpesaRef,
                        amountKes: Number(t.payment.amountKes),
                        screenshotPath: t.payment.screenshotPath,
                      }
                    : null,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
