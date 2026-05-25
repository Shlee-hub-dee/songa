import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { FiltersForm } from './_components/filters-form';
import { ClaimsTable, type ClaimRow } from './_components/claims-table';

export const dynamic = 'force-dynamic';

type SearchParams = {
  from?: string;
  to?: string;
  officerId?: string;
  region?: string;
};

const fmtKes = (v: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(v);

function parseDate(input: string | undefined): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'FINANCE' && me.role !== 'ADMIN') redirect('/dashboard');

  const from = parseDate(searchParams.from);
  const to = parseDate(searchParams.to);
  // Treat `to` inclusively to the end of that day for a friendlier UX.
  const toInclusive = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

  const where = {
    status: 'APPROVED' as const,
    ...(from || toInclusive
      ? { approvedAt: { ...(from && { gte: from }), ...(toInclusive && { lte: toInclusive }) } }
      : {}),
    ...(searchParams.officerId ? { userId: searchParams.officerId } : {}),
    ...(searchParams.region ? { user: { region: searchParams.region } } : {}),
  };

  const [trips, officers, regions] = await Promise.all([
    prisma.trip.findMany({
      where,
      select: {
        id: true,
        type: true,
        distanceKm: true,
        ratePerKm: true,
        amountKes: true,
        startTime: true,
        endTime: true,
        submittedAt: true,
        approvedAt: true,
        notes: true,
        user: { select: { id: true, name: true, email: true, region: true } },
        approver: { select: { name: true } },
        payment: {
          select: {
            mpesaRef: true,
            amountKes: true,
            recipientPhone: true,
            paidAt: true,
          },
        },
      },
      orderBy: { approvedAt: 'asc' },
    }),
    // Only officers who have at least one approved trip — keeps the dropdown
    // useful for a finance team that processes hundreds of users.
    prisma.user.findMany({
      where: { role: 'FIELD_OFFICER', trips: { some: { status: 'APPROVED' } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { region: { not: null } },
      select: { region: true },
      distinct: ['region'],
      orderBy: { region: 'asc' },
    }),
  ]);

  const rows: ClaimRow[] = trips.map((t) => ({
    id: t.id,
    typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
    typeCode: t.type,
    distanceKm: Number(t.distanceKm),
    ratePerKm: Number(t.ratePerKm),
    amountKes: Number(t.amountKes),
    startTime: t.startTime.toISOString(),
    endTime: t.endTime?.toISOString() ?? null,
    submittedAt: t.submittedAt?.toISOString() ?? null,
    approvedAt: t.approvedAt?.toISOString() ?? null,
    notes: t.notes,
    officer: {
      id: t.user.id,
      name: t.user.name,
      email: t.user.email,
      region: t.user.region,
    },
    approverName: t.approver?.name ?? null,
    payment: t.payment
      ? {
          mpesaRef: t.payment.mpesaRef,
          amountKes: Number(t.payment.amountKes),
          recipientPhone: t.payment.recipientPhone,
          paidAt: t.payment.paidAt.toISOString(),
        }
      : null,
  }));

  const totalApproved = rows.reduce((sum, r) => sum + r.amountKes, 0);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Finance</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Approved claims</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No approved claims match these filters.'
            : `${rows.length} ${rows.length === 1 ? 'claim' : 'claims'} · ${fmtKes(totalApproved)} total`}
        </p>
      </header>

      <FiltersForm
        officers={officers}
        regions={regions
          .map((r) => r.region)
          .filter((r): r is string => Boolean(r))}
        initial={{
          from: searchParams.from ?? '',
          to: searchParams.to ?? '',
          officerId: searchParams.officerId ?? '',
          region: searchParams.region ?? '',
        }}
      />

      <div className="mt-5">
        <ClaimsTable rows={rows} />
      </div>
    </main>
  );
}
