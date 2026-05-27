import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { type Role } from '@/lib/roles';
import { BlockedNotice, parseBlockedReason } from '@/components/nav/blocked-notice';
import { KpiCard } from './_components/kpi-card';
import { PipelineStrip, type PipelineStage } from './_components/pipeline-strip';
import { BusiestChart, type DailyCount } from './_components/busiest-chart';
import { AllTripsTable, type TripRow } from './_components/all-trips-table';
import {
  AllPendingSection,
  type PendingTripRow,
} from './_components/all-pending-section';
import { KES } from './_lib/formatters';

export const dynamic = 'force-dynamic';

type Props = { searchParams: { blocked?: string; role?: string } };

export default async function AdminOverview({ searchParams }: Props) {
  const me = await getCurrentUser();
  // See finance/page.tsx for the redirect-loop reasoning.
  if (!me) redirect('/dashboard');
  if (!me.isActive) redirect('/login?signedOut=1');
  if (me.role !== 'ADMIN') redirect('/dashboard');

  // ── Pull everything in parallel ──
  const fieldStaffRoles: Role[] = [
    'TUPANDE_AGENT',
    'ZONE_SUPERVISOR',
    'AREA_COORDINATOR',
  ];

  const [
    tripAggregate,
    approvedAgg,
    reimbursedAgg,
    fieldStaffCount,
    rawTrips,
    units,
    pendingRaw,
  ] = await Promise.all([
    prisma.trip.aggregate({ _sum: { distanceKm: true } }),
    prisma.trip.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amountKes: true },
    }),
    prisma.trip.aggregate({
      where: { status: 'REIMBURSED' },
      _sum: { amountKes: true },
    }),
    prisma.user.count({
      where: { isActive: true, role: { in: fieldStaffRoles } },
    }),
    prisma.trip.findMany({
      select: {
        id: true,
        type: true,
        status: true,
        distanceKm: true,
        amountKes: true,
        startTime: true,
        payment: { select: { id: true } },
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            organisationalUnit: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 500,
    }),
    prisma.user.findMany({
      where: { organisationalUnit: { not: null } },
      select: { organisationalUnit: true },
      distinct: ['organisationalUnit'],
      orderBy: { organisationalUnit: 'asc' },
    }),
    // Org-wide pending queue — no managerId filter because ADMIN can action
    // any pending trip regardless of the approval chain.
    prisma.trip.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        type: true,
        distanceKm: true,
        amountKes: true,
        submittedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            organisationalUnit: true,
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
      take: 500,
    }),
  ]);

  // ── Pipeline ──
  // APPROVED + payment row = "Pending Disbursement"; APPROVED + no payment =
  // simply "Approved". REIMBURSED = "Disbursed". REJECTED gets its own column
  // at the end so the happy-path stays a clean left-to-right flow.
  const pipeline: PipelineStage[] = [
    { key: 'DRAFT', label: 'Draft', tone: 'neutral', count: 0, amount: 0 },
    { key: 'PENDING', label: 'Pending', tone: 'pending', count: 0, amount: 0 },
    { key: 'APPROVED', label: 'Approved', tone: 'positive', count: 0, amount: 0 },
    {
      key: 'PENDING_DISBURSEMENT',
      label: 'Pending Disbursement',
      tone: 'pending',
      count: 0,
      amount: 0,
    },
    { key: 'DISBURSED', label: 'Disbursed', tone: 'positive', count: 0, amount: 0 },
    { key: 'REJECTED', label: 'Rejected', tone: 'rejected', count: 0, amount: 0 },
  ];
  for (const t of rawTrips) {
    const amt = Number(t.amountKes);
    if (t.status === 'DRAFT') {
      pipeline[0].count++;
      pipeline[0].amount += amt;
    } else if (t.status === 'PENDING') {
      pipeline[1].count++;
      pipeline[1].amount += amt;
    } else if (t.status === 'APPROVED') {
      if (t.payment) {
        pipeline[3].count++;
        pipeline[3].amount += amt;
      } else {
        pipeline[2].count++;
        pipeline[2].amount += amt;
      }
    } else if (t.status === 'REIMBURSED') {
      pipeline[4].count++;
      pipeline[4].amount += amt;
    } else if (t.status === 'REJECTED') {
      pipeline[5].count++;
      pipeline[5].amount += amt;
    }
  }

  // ── Busiest-days rollup (last 30 days) ──
  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);
  const dailyCounts = new Map<string, number>();
  for (const t of rawTrips) {
    if (t.startTime < since) continue;
    const key = t.startTime.toISOString().slice(0, 10);
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }
  // Fill empty days with 0 so the bar chart looks continuous.
  const daily: DailyCount[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    daily.push({ dateIso: iso, count: dailyCounts.get(iso) ?? 0 });
  }

  // ── All-pending rows (org-wide PENDING queue rendered for admin) ──
  const pendingRows: PendingTripRow[] = pendingRaw.map((t) => ({
    id: t.id,
    typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
    distanceKm: Number(t.distanceKm),
    amountKes: Number(t.amountKes),
    submittedAtIso: t.submittedAt?.toISOString() ?? null,
    officer: {
      id: t.user.id,
      name: t.user.name,
      role: t.user.role as Role,
      organisationalUnit: t.user.organisationalUnit,
    },
  }));
  const pendingTotalAmount = pendingRows.reduce((s, r) => s + r.amountKes, 0);

  // ── Trips table rows ──
  const tripRows: TripRow[] = rawTrips.map((t) => ({
    id: t.id,
    typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
    status: t.status,
    distanceKm: Number(t.distanceKm),
    amountKes: Number(t.amountKes),
    startTimeIso: t.startTime.toISOString(),
    officer: {
      id: t.user.id,
      name: t.user.name,
      role: t.user.role as Role,
      organisationalUnit: t.user.organisationalUnit,
    },
  }));

  const totalKm = Number(tripAggregate._sum.distanceKm ?? 0);
  const pendingDisbursementAmount = Number(approvedAgg._sum.amountKes ?? 0);
  const disbursedAmount = Number(reimbursedAgg._sum.amountKes ?? 0);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      {(() => {
        const reason = parseBlockedReason(searchParams.blocked);
        return reason ? (
          <BlockedNotice role={searchParams.role as Role | undefined} reason={reason} />
        ) : null;
      })()}

      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Admin</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisation-wide snapshot. Tap any trip to see GPS detail.
        </p>
      </header>

      {/* ── KPIs ── */}
      <section
        aria-label="Key performance indicators"
        className="grid grid-cols-2 gap-3 sm:gap-4 tablet:grid-cols-4"
      >
        <KpiCard label="Total km" value={totalKm.toFixed(1)} suffix="km" />
        <KpiCard
          label="Pending disbursement"
          value={KES.format(pendingDisbursementAmount)}
          highlight="amber"
        />
        <KpiCard
          label="Disbursed"
          value={KES.format(disbursedAmount)}
          highlight="brand"
        />
        <KpiCard label="Active field staff" value={fieldStaffCount.toString()} />
      </section>

      {/* ── Pipeline ── */}
      <section className="mt-6">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            Trip pipeline
          </h2>
          <p className="text-xs text-muted-foreground">Counts and totals per stage</p>
        </header>
        <PipelineStrip stages={pipeline} />
      </section>

      {/* ── All Pending Trips (org-wide) ──
          Admins can act on any pending trip, ignoring the direct-report
          and role-tier rules other approvers are bound by. Approving or
          rejecting here writes to audit_log (actor = this admin) and
          broadcasts on officer:{officerId} via the existing /api/claims
          routes. */}
      <section className="mt-6">
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            All pending trips
          </h2>
          <p className="text-xs text-muted-foreground">
            {pendingRows.length === 0
              ? 'No pending trips'
              : `${pendingRows.length} trip${pendingRows.length === 1 ? '' : 's'} · ${KES.format(pendingTotalAmount)}`}
          </p>
        </header>
        <AllPendingSection trips={pendingRows} />
      </section>

      {/* ── Busiest days ── */}
      <section className="mt-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <header className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            Busiest days
          </h2>
        </header>
        <BusiestChart daily={daily} />
      </section>

      {/* ── All trips table ── */}
      <section className="mt-6">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            Recent trips
          </h2>
          <p className="text-xs text-muted-foreground">{tripRows.length} loaded</p>
        </header>
        <AllTripsTable
          trips={tripRows}
          organisationalUnits={units
            .map((u) => u.organisationalUnit)
            .filter((u): u is string => Boolean(u))}
        />
      </section>
    </main>
  );
}
