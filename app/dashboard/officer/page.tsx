import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';
import { resolveRateForDate } from '@/lib/rates';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { BlockedNotice, parseBlockedReason } from '@/components/nav/blocked-notice';
import { EarningsChart, type MonthlyEarnings } from './_components/earnings-chart';

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

type PipelineStage = {
  key: 'DRAFT' | 'PENDING' | 'APPROVED' | 'PENDING_DISBURSAL' | 'DISBURSED';
  label: string;
  tone: 'neutral' | 'positive' | 'pending';
  count: number;
  amount: number;
};

const STAGE_TONE_CLASSES: Record<PipelineStage['tone'], string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-900',
  positive: 'border-brand/30 bg-brand-surface text-brand',
};

const STAGE_DOT_CLASSES: Record<PipelineStage['tone'], string> = {
  neutral: 'bg-slate-400',
  pending: 'bg-amber-500',
  positive: 'bg-brand',
};

const STATUS_PILL: Record<
  'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED',
  { label: string; className: string }
> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-900' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-900' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-900' },
  REIMBURSED: { label: 'Disbursed', className: 'bg-brand text-white' },
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildLast6Months(): MonthlyEarnings[] {
  const out: MonthlyEarnings[] = [];
  const now = startOfMonth(new Date());
  const fmt = new Intl.DateTimeFormat('en-KE', { month: 'short' });
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    out.push({ key: monthKey(d), label: fmt.format(d), claimed: 0, received: 0 });
  }
  return out;
}

type Props = { searchParams: { blocked?: string; role?: string } };

export default async function OfficerDashboard({ searchParams }: Props) {
  const me = await getCurrentUser();
  if (!me || !me.isActive) redirect('/login');

  // Resolve current rate AND fetch trips in parallel — they're independent
  // so there's no reason to serialise.
  const [resolved, trips] = await Promise.all([
    resolveRateForDate(new Date()).catch(() => null),
    prisma.trip.findMany({
      where: { userId: me.id },
      select: {
        id: true,
        type: true,
        status: true,
        distanceKm: true,
        amountKes: true,
        startTime: true,
        submittedAt: true,
        reimbursedAt: true,
        payment: { select: { id: true } },
      },
      orderBy: { startTime: 'desc' },
      // Bound the table so a power-user with hundreds of trips doesn't
      // ship a multi-megabyte payload. The KPI roll-ups become "last N",
      // which is fine for personal at-a-glance numbers.
      take: 500,
    }),
  ]);
  const ratePerKm = resolved?.ratePerKm ?? null;

  // ── KPIs ──
  const totalTrips = trips.length;
  const totalKm = trips.reduce((s, t) => s + Number(t.distanceKm), 0);
  const totalClaimed = trips
    .filter((t) => t.status !== 'DRAFT' && t.status !== 'REJECTED')
    .reduce((s, t) => s + Number(t.amountKes), 0);
  const totalReceived = trips
    .filter((t) => t.status === 'REIMBURSED')
    .reduce((s, t) => s + Number(t.amountKes), 0);

  // ── Pipeline buckets ──
  // "Approved" = manager approved, officer hasn't attached payment evidence yet.
  // "Pending Disbursal" = approved + payment row exists (waiting on finance).
  // Rejected trips are excluded from the happy-path pipeline.
  const pipeline: PipelineStage[] = [
    { key: 'DRAFT', label: 'Draft', tone: 'neutral', count: 0, amount: 0 },
    { key: 'PENDING', label: 'Pending', tone: 'pending', count: 0, amount: 0 },
    { key: 'APPROVED', label: 'Approved', tone: 'positive', count: 0, amount: 0 },
    {
      key: 'PENDING_DISBURSAL',
      label: 'Pending Disbursal',
      tone: 'pending',
      count: 0,
      amount: 0,
    },
    { key: 'DISBURSED', label: 'Disbursed', tone: 'positive', count: 0, amount: 0 },
  ];
  for (const t of trips) {
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
    }
  }

  // ── Earnings (last 6 months) ──
  // Claimed: submittedAt month, any non-DRAFT/REJECTED.
  // Received: reimbursedAt month, REIMBURSED only.
  const earnings = buildLast6Months();
  const byKey = new Map(earnings.map((m) => [m.key, m]));
  for (const t of trips) {
    const amt = Number(t.amountKes);
    if (t.submittedAt && t.status !== 'DRAFT' && t.status !== 'REJECTED') {
      const m = byKey.get(monthKey(t.submittedAt));
      if (m) m.claimed += amt;
    }
    if (t.status === 'REIMBURSED' && t.reimbursedAt) {
      const m = byKey.get(monthKey(t.reimbursedAt));
      if (m) m.received += amt;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pb-32 sm:pt-6">
      {(() => {
        const reason = parseBlockedReason(searchParams.blocked);
        return reason ? (
          <BlockedNotice
            role={searchParams.role as Role | undefined}
            reason={reason}
          />
        ) : null;
      })()}

      {/* ── Welcome banner ── */}
      {/* Page is shared by anyone who can log trips (AGENT / SUPERVISOR /
          COORDINATOR), so the eyebrow label echoes the user's actual role
          rather than the literal "Field Officer". */}
      <section className="rounded-xl border border-brand/20 bg-gradient-to-r from-brand to-brand/80 p-5 text-white shadow-sm sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">
          {ROLE_LABEL[me.role as Role] ?? 'Field Officer'}
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
          Karibu, {firstName(me.name)}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
            Region: <strong className="font-semibold">{me.region ?? '—'}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
            Current rate:{' '}
            <strong className="font-semibold">
              {ratePerKm != null ? `${KES.format(ratePerKm)} / km` : 'not set'}
            </strong>
          </span>
        </div>
      </section>

      {/* ── KPI cards ── */}
      <section
        aria-label="Key performance indicators"
        className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 tablet:grid-cols-4"
      >
        <Kpi label="Total trips" value={totalTrips.toString()} />
        <Kpi label="Total km" value={totalKm.toFixed(1)} suffix="km" />
        <Kpi label="Claimed" value={KES.format(totalClaimed)} />
        <Kpi
          label="Received"
          value={KES.format(totalReceived)}
          highlight
        />
      </section>

      {/* ── Pipeline ── */}
      <section className="mt-6" aria-label="Trip status pipeline">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            Claim pipeline
          </h2>
          <p className="text-xs text-muted-foreground">Counts and totals per stage</p>
        </header>
        <ol className="grid grid-cols-1 gap-2 tablet:grid-cols-5">
          {pipeline.map((stage, i) => (
            <li key={stage.key}>
              <div
                className={`relative h-full rounded-lg border p-3 ${STAGE_TONE_CLASSES[stage.tone]}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${STAGE_DOT_CLASSES[stage.tone]}`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <p className="text-xs font-medium uppercase tracking-wide">
                    {stage.label}
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{stage.count}</p>
                <p className="mt-0.5 text-xs opacity-80">{KES.format(stage.amount)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Earnings chart ── */}
      <section className="mt-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <header className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            Earnings — last 6 months
          </h2>
          <p className="hidden text-xs text-muted-foreground tablet:block">
            Claimed vs received per month
          </p>
        </header>
        <div className="h-56 w-full sm:h-64">
          <EarningsChart data={earnings} />
        </div>
      </section>

      {/* ── My trips table ── */}
      <section id="trips" className="mt-6 scroll-mt-20" aria-label="My trips">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">My trips</h2>
          <p className="text-xs text-muted-foreground">{totalTrips} total</p>
        </header>

        {trips.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No trips yet. Tap{' '}
            <span className="font-medium text-brand">Start New Trip</span> below to log your
            first one.
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="grid gap-2 tablet:hidden">
              {trips.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/dashboard/trips/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-brand-surface/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {DATE.format(t.startTime)}
                      </p>
                      <p className="truncate text-sm font-medium text-foreground">
                        {TRIP_TYPE_LABEL[t.type as TripType]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Number(t.distanceKm).toFixed(1)} km ·{' '}
                        {KES.format(Number(t.amountKes))}
                      </p>
                    </div>
                    <StatusPill status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>

            {/* Tablet+: real table */}
            <div className="hidden overflow-hidden rounded-lg border bg-card shadow-sm tablet:block">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Trip type</th>
                    <th className="px-4 py-2.5 text-right">Distance</th>
                    <th className="px-4 py-2.5 text-right">Amount claimed</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {trips.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer transition-colors hover:bg-brand-surface/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/trips/${t.id}`}
                          className="block text-foreground"
                        >
                          {DATE.format(t.startTime)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/trips/${t.id}`}
                          className="block text-foreground"
                        >
                          {TRIP_TYPE_LABEL[t.type as TripType]}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        <Link
                          href={`/dashboard/trips/${t.id}`}
                          className="block"
                        >
                          {Number(t.distanceKm).toFixed(2)} km
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        <Link
                          href={`/dashboard/trips/${t.id}`}
                          className="block"
                        >
                          {KES.format(Number(t.amountKes))}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/trips/${t.id}`}
                          className="block"
                        >
                          <StatusPill status={t.status} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── Sticky CTA ── */}
      {/* Fixed at the bottom of the viewport. The main container has pb-28/32 above
          to prevent the table from disappearing under it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 sm:px-6">
        <div className="pointer-events-auto mx-auto max-w-md">
          <Link
            href="/dashboard/trips/new"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand text-base font-semibold text-white shadow-lg ring-1 ring-brand/30 transition-colors hover:bg-brand/90 active:scale-[0.98]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z"
                clipRule="evenodd"
              />
            </svg>
            Start New Trip
          </Link>
        </div>
      </div>
    </main>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function Kpi({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: string;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-colors ${
        highlight ? 'border-brand/40 bg-brand-surface' : 'border-border bg-card'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 text-xl font-bold tabular-nums sm:text-2xl ${
          highlight ? 'text-brand' : 'text-foreground'
        }`}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-xs font-medium text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
}) {
  const cfg = STATUS_PILL[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}
