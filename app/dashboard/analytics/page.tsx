import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TripsPerDayChart } from './_components/trips-per-day-chart';
import { StatusBreakdownChart } from './_components/status-breakdown-chart';

export const dynamic = 'force-dynamic';

const DROP_AGE_HOURS = 8;

const STATUS_ORDER = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED'] as const;
const STATUS_COLORS: Record<(typeof STATUS_ORDER)[number], string> = {
  DRAFT: '#94A3B8',
  PENDING: '#3B82F6',
  APPROVED: '#7AB648',
  REJECTED: '#EF4444',
  REIMBURSED: '#006B3F',
};

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// Returns ascending list of the last 7 day-keys (YYYY-MM-DD in local tz).
function last7Days(): { key: string; label: string; start: Date; end: Date }[] {
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  const today = startOfDay(new Date());
  for (let i = 6; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    out.push({
      key: start.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en-KE', { weekday: 'short' }).format(start),
      start,
      end,
    });
  }
  return out;
}

export default async function AnalyticsPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  // Analytics is available to all approvers + finance + admin (anyone above
  // individual contributor in the hierarchy).
  const ANALYTICS_ROLES = new Set([
    'ZONE_SUPERVISOR',
    'AREA_COORDINATOR',
    'REGIONAL_MANAGER',
    'FINANCE_MANAGER',
    'ADMIN',
  ]);
  if (!ANALYTICS_ROLES.has(me.role)) {
    redirect('/dashboard');
  }

  const days = last7Days();
  const todayStart = startOfTodayUtc();
  const dropCutoff = new Date(Date.now() - DROP_AGE_HOURS * 60 * 60 * 1000);

  const [
    visitsToday,
    tripsByDay,
    droppedCount,
    totalTrips,
    statusGroups,
  ] = await Promise.all([
    // App visits today — distinct sessions seen in analytics_events.
    prisma.analyticsEvent.findMany({
      where: { eventName: 'page_visit', createdAt: { gte: todayStart } },
      select: { sessionId: true },
      distinct: ['sessionId'],
    }),
    // Trips completed (submittedAt is set) in the last 7 days, one query per
    // day-bucket because Postgres `date_trunc` isn't expressible via Prisma
    // findMany. Seven cheap counts is fine for a dashboard.
    Promise.all(
      days.map((d) =>
        prisma.trip.count({
          where: { submittedAt: { gte: d.start, lt: d.end } },
        }),
      ),
    ),
    prisma.trip.count({
      where: { status: 'DRAFT', createdAt: { lt: dropCutoff } },
    }),
    prisma.trip.count(),
    prisma.trip.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const dropRatePct = totalTrips > 0 ? (droppedCount / totalTrips) * 100 : 0;

  const tripsPerDay = days.map((d, i) => ({
    day: d.label,
    date: d.key,
    count: tripsByDay[i],
  }));
  // Today is the last bucket in the 7-day window.
  const tripsToday = tripsByDay[tripsByDay.length - 1] ?? 0;

  const statusBreakdown = STATUS_ORDER.map((s) => ({
    status: s,
    count: statusGroups.find((g) => g.status === s)?._count._all ?? 0,
    color: STATUS_COLORS[s],
  }));

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Analytics</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Today at a glance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last refreshed {new Date().toLocaleString()}.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 tablet:grid-cols-4">
        <StatCard
          label="App visits today"
          value={visitsToday.length.toString()}
          hint="Distinct sessions on any page"
        />
        <StatCard
          label="Trips today"
          value={tripsToday.toString()}
          hint="Submitted in the last 24 hours"
        />
        <StatCard
          label="Trip drop rate"
          value={`${dropRatePct.toFixed(1)}%`}
          hint={`DRAFTs older than ${DROP_AGE_HOURS}h ÷ total trips (${droppedCount}/${totalTrips})`}
          tone={dropRatePct > 10 ? 'warn' : 'ok'}
        />
        <StatCard
          label="Total trips"
          value={totalTrips.toString()}
          hint="All-time, all statuses"
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Trips completed · last 7 days
          </h2>
          <div className="mt-3 h-64">
            <TripsPerDayChart data={tripsPerDay} />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Claim status breakdown
          </h2>
          <div className="mt-3 h-64">
            <StatusBreakdownChart data={statusBreakdown} />
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'ok',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${
          tone === 'warn' ? 'text-amber-700' : 'text-brand'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
