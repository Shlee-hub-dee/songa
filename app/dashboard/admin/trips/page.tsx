import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { ROLE_LABEL, type Role } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});
const DATE = new Intl.DateTimeFormat('en-KE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const STATUS_PILL: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-emerald-100 text-emerald-900',
  REJECTED: 'bg-red-100 text-red-900',
  REIMBURSED: 'bg-brand text-white',
};

// Admin-only catch-all trip list. Direct-report filtering DOES NOT apply
// here — admins see the whole org. Useful for fraud review and back-office
// investigations. Caps at 200 rows; richer filtering is a follow-up.
export default async function AdminAllTripsPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'ADMIN') redirect('/dashboard');

  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      type: true,
      status: true,
      distanceKm: true,
      amountKes: true,
      startTime: true,
      user: {
        select: { name: true, role: true, organisationalUnit: true },
      },
    },
    orderBy: { startTime: 'desc' },
    take: 200,
  });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Admin</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">All trips</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Most recent {trips.length}. Audit log entries for each state change
          are written by the API routes that mutate trip status.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Officer</th>
              <th className="px-4 py-2.5">Unit</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5 text-right">Distance</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {trips.map((t) => (
              <tr key={t.id} className="hover:bg-brand-surface/40">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/trips/${t.id}`}>{DATE.format(t.startTime)}</Link>
                </td>
                <td className="px-4 py-3">
                  <div className="text-foreground">{t.user.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {ROLE_LABEL[t.user.role as Role]}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.user.organisationalUnit ?? '—'}
                </td>
                <td className="px-4 py-3">{TRIP_TYPE_LABEL[t.type as TripType]}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {Number(t.distanceKm).toFixed(2)} km
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {KES.format(Number(t.amountKes))}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_PILL[t.status] ?? ''}`}
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
