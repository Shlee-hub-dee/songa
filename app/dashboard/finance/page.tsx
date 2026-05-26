import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { BlockedNotice } from '@/components/nav/blocked-notice';
import { KpiCard } from '../admin/_components/kpi-card';
import { FilterBar } from './_components/filter-bar';
import { FinanceView } from './_components/finance-view';
import {
  ExportPayrollButton,
  type PayrollRow,
} from './_components/export-payroll-button';
import {
  SpendByUnitChart,
  type UnitSpend,
} from './_components/spend-by-unit-chart';
import {
  MonthlyTrendChart,
  type MonthlyPoint,
} from './_components/monthly-trend-chart';
import type { OfficerGroup } from './_components/reimbursement-queue';
import { lastNMonths, parsePeriod, periodLabel, periodRange } from './_lib/period';

export const dynamic = 'force-dynamic';

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const LOGGER_ROLES: Role[] = ['TUPANDE_AGENT', 'ZONE_SUPERVISOR', 'AREA_COORDINATOR'];

const MONTH_FMT = new Intl.DateTimeFormat('en-KE', { month: 'short', year: '2-digit' });

type Props = {
  searchParams: {
    period?: string;
    region?: string;
    role?: string;
    blocked?: string;
  };
};

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfQuarter(): Date {
  const d = new Date();
  const qStart = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStart, 1);
}

export default async function FinancePage({ searchParams }: Props) {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'FINANCE_MANAGER' && me.role !== 'ADMIN') redirect('/dashboard');

  // ── Parse filters ──
  const period = parsePeriod(searchParams.period);
  const periodWindow = periodRange(period);
  const regionFilter = searchParams.region || null;
  const roleFilter = (searchParams.role as Role | undefined) || null;

  // userWhere: applied wherever we constrain by officer attributes.
  const userWhere: Record<string, unknown> = {};
  if (regionFilter) userWhere.region = regionFilter;
  if (roleFilter) userWhere.role = roleFilter;

  // ── Queries ──
  // Reimbursement queue: APPROVED trips, optionally filtered by region/role.
  // Period filter is intentionally NOT applied to the queue itself (you
  // always want to see all approved-but-not-yet-paid work), but it IS
  // applied to the KPIs and analytics below.
  const monthStart = startOfMonth();
  const quarterStart = startOfQuarter();

  const [pendingTrips, monthDisbursedAgg, quarterDisbursedAgg, periodTrips] =
    await Promise.all([
      prisma.trip.findMany({
        where: {
          status: 'APPROVED',
          ...(Object.keys(userWhere).length > 0 ? { user: userWhere } : {}),
        },
        select: {
          id: true,
          type: true,
          distanceKm: true,
          amountKes: true,
          startTime: true,
          submittedAt: true,
          approvedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              role: true,
              region: true,
              phone: true,
              organisationalUnit: true,
            },
          },
          payment: {
            select: { mpesaRef: true, recipientPhone: true, paidAt: true },
          },
        },
        orderBy: { approvedAt: 'asc' },
      }),
      prisma.trip.aggregate({
        where: {
          status: 'REIMBURSED',
          reimbursedAt: { gte: monthStart },
          ...(Object.keys(userWhere).length > 0 ? { user: userWhere } : {}),
        },
        _sum: { amountKes: true },
      }),
      prisma.trip.aggregate({
        where: {
          status: 'REIMBURSED',
          reimbursedAt: { gte: quarterStart },
          ...(Object.keys(userWhere).length > 0 ? { user: userWhere } : {}),
        },
        _sum: { amountKes: true },
      }),
      // For the spend analytics + role breakdown. Apply the period filter if
      // one is set; otherwise pull the last 12 months so the trend chart has
      // useful data without overloading the query.
      (() => {
        const since = periodWindow?.start ?? lastNMonthsStart();
        const until = periodWindow?.end ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
        return prisma.trip.findMany({
          where: {
            status: { in: ['APPROVED', 'REIMBURSED'] },
            startTime: { gte: since, lt: until },
            ...(Object.keys(userWhere).length > 0 ? { user: userWhere } : {}),
          },
          select: {
            id: true,
            status: true,
            amountKes: true,
            startTime: true,
            user: {
              select: { id: true, role: true, organisationalUnit: true, region: true },
            },
          },
        });
      })(),
    ]);

  // ── Group pending trips by officer ──
  type OfficerAggregate = OfficerGroup & { groupAmount: number };
  const byOfficer = new Map<string, OfficerAggregate>();
  for (const t of pendingTrips) {
    const id = t.user.id;
    const existing = byOfficer.get(id);
    const tripEntry = {
      id: t.id,
      typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
      distanceKm: Number(t.distanceKm),
      amountKes: Number(t.amountKes),
      startTimeIso: t.startTime.toISOString(),
      mpesaRef: t.payment?.mpesaRef ?? null,
    };
    if (existing) {
      existing.tripCount++;
      existing.totalAmount += Number(t.amountKes);
      existing.tripIds.push(t.id);
      existing.trips.push(tripEntry);
      if (
        t.submittedAt &&
        (!existing.oldestSubmittedIso ||
          t.submittedAt.toISOString() < existing.oldestSubmittedIso)
      ) {
        existing.oldestSubmittedIso = t.submittedAt.toISOString();
      }
    } else {
      byOfficer.set(id, {
        officerId: id,
        name: t.user.name,
        role: t.user.role as Role,
        organisationalUnit: t.user.organisationalUnit,
        phone: t.user.phone,
        mpesaNumber: t.payment?.recipientPhone ?? t.user.phone ?? null,
        tripCount: 1,
        totalAmount: Number(t.amountKes),
        oldestSubmittedIso: t.submittedAt?.toISOString() ?? null,
        tripIds: [t.id],
        trips: [tripEntry],
        groupAmount: Number(t.amountKes),
      });
    }
  }
  const groups: OfficerGroup[] = Array.from(byOfficer.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount,
  );

  // ── KPIs ──
  const pendingTotalAmount = groups.reduce((s, g) => s + g.totalAmount, 0);
  const officersWithPendingCount = groups.length;
  const monthDisbursed = Number(monthDisbursedAgg._sum.amountKes ?? 0);
  const quarterDisbursed = Number(quarterDisbursedAgg._sum.amountKes ?? 0);

  // ── Spend analytics from periodTrips ──
  const unitSpend = new Map<string, number>();
  const trendByMonthKey = new Map<string, number>();
  const roleBreakdown = new Map<Role, { trips: number; amount: number }>();
  for (const t of periodTrips) {
    const amt = Number(t.amountKes);
    const unit = t.user.organisationalUnit ?? 'Unassigned';
    unitSpend.set(unit, (unitSpend.get(unit) ?? 0) + amt);
    const k = `${t.startTime.getFullYear()}-${t.startTime.getMonth()}`;
    trendByMonthKey.set(k, (trendByMonthKey.get(k) ?? 0) + amt);
    const r = t.user.role as Role;
    const existing = roleBreakdown.get(r) ?? { trips: 0, amount: 0 };
    existing.trips++;
    existing.amount += amt;
    roleBreakdown.set(r, existing);
  }

  const unitSpendData: UnitSpend[] = Array.from(unitSpend.entries())
    .map(([unit, amount]) => ({ unit, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12); // top 12 units to keep the chart readable

  const trend: MonthlyPoint[] = lastNMonths(12).map(({ year, month }) => ({
    label: MONTH_FMT.format(new Date(year, month, 1)),
    amount: trendByMonthKey.get(`${year}-${month}`) ?? 0,
  }));

  const roleRows = LOGGER_ROLES.map((r) => ({
    role: r,
    ...(roleBreakdown.get(r) ?? { trips: 0, amount: 0 }),
  }));

  // ── Region dropdown options ──
  const regions = await prisma.user.findMany({
    where: { region: { not: null } },
    select: { region: true },
    distinct: ['region'],
    orderBy: { region: 'asc' },
  });

  const payrollRows: PayrollRow[] = groups.map((g) => {
    const totalKm = g.trips.reduce((s, t) => s + t.distanceKm, 0);
    return {
      officerId: g.officerId,
      name: g.name,
      phone: g.phone,
      mpesaNumber: g.mpesaNumber,
      organisationalUnit: g.organisationalUnit,
      role: g.role,
      totalTrips: g.tripCount,
      totalKm,
      totalAmount: g.totalAmount,
    };
  });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      {searchParams.blocked === 'trip-log' ? (
        <BlockedNotice reason="trip-log" />
      ) : null}

      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand">Finance</p>
          <h1 className="text-2xl font-bold leading-tight text-foreground">
            Disbursement queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analytics scoped to{' '}
            <span className="font-medium text-foreground">{periodLabel(period)}</span>
            {regionFilter ? (
              <>
                {' '}· region{' '}
                <span className="font-medium text-foreground">{regionFilter}</span>
              </>
            ) : null}
            {roleFilter ? (
              <>
                {' '}· role{' '}
                <span className="font-medium text-foreground">
                  {ROLE_LABEL[roleFilter]}
                </span>
              </>
            ) : null}
            .
          </p>
        </div>
        <ExportPayrollButton rows={payrollRows} />
      </header>

      <section aria-label="Filters" className="mb-5 rounded-md border bg-card p-3">
        <FilterBar
          regions={regions
            .map((r) => r.region)
            .filter((r): r is string => Boolean(r))}
        />
      </section>

      {/* ── KPIs ── */}
      <section
        aria-label="Key performance indicators"
        className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 tablet:grid-cols-4"
      >
        <KpiCard
          label="Pending disbursement"
          value={KES.format(pendingTotalAmount)}
          highlight={pendingTotalAmount > 0 ? 'amber' : 'neutral'}
        />
        <KpiCard
          label="Disbursed this month"
          value={KES.format(monthDisbursed)}
          highlight="brand"
        />
        <KpiCard
          label="Disbursed this quarter"
          value={KES.format(quarterDisbursed)}
        />
        <KpiCard
          label="Officers awaiting payout"
          value={officersWithPendingCount.toString()}
        />
      </section>

      {/* ── Reimbursement queue ── */}
      <section className="mb-8" aria-label="Reimbursement queue">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            Reimbursement queue
          </h2>
          <p className="text-xs text-muted-foreground">
            {groups.length} officer{groups.length === 1 ? '' : 's'} awaiting payout
          </p>
        </header>
        <FinanceView groups={groups} />
      </section>

      {/* ── Spend analytics ── */}
      <section className="mb-6 grid gap-4 tablet:grid-cols-2">
        <article className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <header className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-foreground sm:text-lg">
              Spend by organisational unit
            </h2>
          </header>
          <p className="mb-2 text-xs text-muted-foreground">
            {period.type === 'all' ? 'Last 12 months' : periodLabel(period)}
            {' '}— top 12 units
          </p>
          <div className="h-64 w-full sm:h-72">
            <SpendByUnitChart data={unitSpendData} />
          </div>
        </article>
        <article className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <header className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-foreground sm:text-lg">
              Monthly spend trend
            </h2>
          </header>
          <p className="mb-2 text-xs text-muted-foreground">Last 12 months</p>
          <div className="h-64 w-full sm:h-72">
            <MonthlyTrendChart data={trend} />
          </div>
        </article>
      </section>

      {/* ── Role breakdown ── */}
      <section className="mb-8" aria-label="Spend by role">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            Spend by role
          </h2>
          <p className="text-xs text-muted-foreground">
            {period.type === 'all' ? 'Last 12 months' : periodLabel(period)}
          </p>
        </header>
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
              <tr>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5 text-right">Trips</th>
                <th className="px-4 py-2.5 text-right">Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {roleRows.map((r) => (
                <tr key={r.role}>
                  <td className="px-4 py-2.5">{ROLE_LABEL[r.role]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.trips}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {KES.format(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

// Inline helper — start of the 12-month trend window (1st of the month
// twelve months ago). Pulled out so the queries above stay readable.
function lastNMonthsStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 11, 1);
}
