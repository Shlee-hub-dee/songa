import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { BlockedNotice } from '@/components/nav/blocked-notice';
import { HierarchyBreadcrumb } from './_components/hierarchy-breadcrumb';
import { ApprovalsView } from './_components/approvals-view';
import { KpiCard } from '../admin/_components/kpi-card';

export const dynamic = 'force-dynamic';

const APPROVER_ROLES: readonly Role[] = [
  'ZONE_SUPERVISOR',
  'AREA_COORDINATOR',
  'REGIONAL_MANAGER',
] as const;

type Props = { searchParams: { blocked?: string; role?: string } };

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function ApprovalsPage({ searchParams }: Props) {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      organisationalUnit: true,
      unitLevel: true,
      managerId: true,
    },
  });
  if (!me || !me.isActive) redirect('/login');

  const role = me.role as Role;
  // ADMIN is permitted to view this page (their direct reports are the RMs);
  // every other non-approver role gets bounced.
  if (role !== 'ADMIN' && !APPROVER_ROLES.includes(role)) {
    redirect('/dashboard');
  }

  // ── Walk the manager chain (max 3 hops) to build the org breadcrumb ──
  // Each step climbs one manager; the order is bottom→top, so we reverse at
  // the end to render Region → Area → Zone. ZS sees three parts, AC two, RM
  // one. Admin sees nothing relevant — they get a generic "All Reports" crumb.
  const crumbParts: string[] = [];
  let cursor: { id: string; managerId: string | null; organisationalUnit: string | null } | null = {
    id: me.id,
    managerId: me.managerId,
    organisationalUnit: me.organisationalUnit,
  };
  let safety = 0;
  while (cursor && safety < 5) {
    if (cursor.organisationalUnit) crumbParts.unshift(cursor.organisationalUnit);
    if (!cursor.managerId) break;
    cursor = await prisma.user.findUnique({
      where: { id: cursor.managerId },
      select: { id: true, managerId: true, organisationalUnit: true },
    });
    safety++;
  }
  if (role === 'ADMIN' && crumbParts.length === 0) {
    crumbParts.push('All organisational units');
  }

  // ── Data fetches in parallel ──
  // EVERY query is constrained to `user: { managerId: me.id }` so this page
  // can never leak trips outside the approver's direct reports. The same
  // rule is re-enforced in the approve/reject APIs.
  const directReportFilter = { user: { managerId: me.id } as const };
  const monthStart = startOfMonth();

  const [
    pendingTrips,
    teamTripsRaw,
    myTripsRaw,
    monthAggApproved,
    monthAggRejected,
    monthAggReimbursed,
    monthAggPending,
    monthKmAgg,
  ] = await Promise.all([
    prisma.trip.findMany({
      where: { status: 'PENDING', ...directReportFilter },
      select: {
        id: true,
        type: true,
        distanceKm: true,
        amountKes: true,
        gpsPointCount: true,
        submittedAt: true,
        user: {
          select: { id: true, name: true, role: true, organisationalUnit: true },
        },
        payment: { select: { mpesaRef: true, amountKes: true, screenshotPath: true } },
      },
      orderBy: { submittedAt: 'asc' },
    }),
    prisma.trip.findMany({
      where: directReportFilter,
      select: {
        id: true,
        type: true,
        status: true,
        distanceKm: true,
        amountKes: true,
        startTime: true,
        user: {
          select: { id: true, name: true, role: true, organisationalUnit: true },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 500,
    }),
    prisma.trip.findMany({
      where: { userId: me.id },
      select: {
        id: true,
        type: true,
        status: true,
        distanceKm: true,
        amountKes: true,
        startTime: true,
      },
      orderBy: { startTime: 'desc' },
      take: 200,
    }),
    prisma.trip.count({
      where: {
        ...directReportFilter,
        approvedAt: { gte: monthStart },
        status: { in: ['APPROVED', 'REIMBURSED'] },
      },
    }),
    prisma.trip.count({
      where: {
        ...directReportFilter,
        rejectedAt: { gte: monthStart },
        status: 'REJECTED',
      },
    }),
    prisma.trip.count({
      where: {
        ...directReportFilter,
        reimbursedAt: { gte: monthStart },
        status: 'REIMBURSED',
      },
    }),
    prisma.trip.count({
      where: { ...directReportFilter, status: 'PENDING' },
    }),
    prisma.trip.aggregate({
      where: { ...directReportFilter, startTime: { gte: monthStart } },
      _sum: { distanceKm: true },
    }),
  ]);

  // Shape the data for the client view.
  const claims = pendingTrips.map((t) => ({
    id: t.id,
    typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
    distanceKm: Number(t.distanceKm),
    amountKes: Number(t.amountKes),
    waypointCount: t.gpsPointCount,
    submittedAt: t.submittedAt?.toISOString() ?? null,
    officer: {
      id: t.user.id,
      name: t.user.name,
      role: t.user.role as Role,
      organisationalUnit: t.user.organisationalUnit,
    },
    payment: t.payment
      ? {
          mpesaRef: t.payment.mpesaRef,
          amountKes: Number(t.payment.amountKes),
          screenshotPath: t.payment.screenshotPath,
        }
      : null,
  }));

  const teamTrips = teamTripsRaw.map((t) => ({
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

  const myTrips = myTripsRaw.map((t) => ({
    id: t.id,
    typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
    status: t.status,
    distanceKm: Number(t.distanceKm),
    amountKes: Number(t.amountKes),
    startTimeIso: t.startTime.toISOString(),
  }));

  // Status donut data — direct-report trips only, current month.
  const monthBreakdown = [
    { status: 'Pending', count: monthAggPending },
    { status: 'Approved', count: monthAggApproved },
    { status: 'Rejected', count: monthAggRejected },
    { status: 'Disbursed', count: monthAggReimbursed },
  ];

  const showMyTripsTab = role === 'ZONE_SUPERVISOR' || role === 'AREA_COORDINATOR';
  const totalTeamKmThisMonth = Number(monthKmAgg._sum.distanceKm ?? 0);
  const pendingCount = pendingTrips.length;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      {searchParams.blocked === 'trip-log' ? (
        <BlockedNotice role={searchParams.role as Role | undefined} reason="trip-log" />
      ) : null}

      {/* ── Title + breadcrumb ── */}
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">
          {ROLE_LABEL[role]} · Approvals
        </p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          {pendingCount === 0
            ? 'No claims waiting'
            : `${pendingCount} ${pendingCount === 1 ? 'claim' : 'claims'} awaiting review`}
        </h1>
        <div className="mt-1">
          <HierarchyBreadcrumb parts={crumbParts} />
        </div>
      </header>

      {/* ── KPIs ── */}
      <section
        aria-label="Key performance indicators"
        className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 tablet:grid-cols-4"
      >
        <KpiCard
          label="Pending"
          value={pendingCount.toString()}
          highlight={pendingCount > 0 ? 'amber' : 'neutral'}
        />
        <KpiCard label="Approved this month" value={monthAggApproved.toString()} />
        <KpiCard label="Rejected this month" value={monthAggRejected.toString()} />
        <KpiCard
          label="Team km this month"
          value={totalTeamKmThisMonth.toFixed(1)}
          suffix="km"
        />
      </section>

      {/* ── Interactive shell: tabs, side panel, donut, team report ── */}
      <ApprovalsView
        role={role}
        claims={claims}
        myTrips={myTrips}
        teamTrips={teamTrips}
        monthBreakdown={monthBreakdown}
        showMyTripsTab={showMyTripsTab}
      />

      {/* Helper line at the bottom for ADMIN viewers — their "direct reports"
          are only the Regional Managers, so claims here may be sparser than
          they expect. */}
      {role === 'ADMIN' && crumbParts.length <= 1 ? (
        <p className="mt-6 rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground">
          You&apos;re viewing approvals for your direct reports (Regional Managers).
          For an organisation-wide view see{' '}
          <a href="/dashboard/admin" className="text-brand hover:underline">
            Admin Overview
          </a>
          .
        </p>
      ) : null}
    </main>
  );
}
