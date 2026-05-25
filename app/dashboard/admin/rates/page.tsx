import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { NewRateForm } from './_components/new-rate-form';

export const dynamic = 'force-dynamic';

const fmtKes = (v: number) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
  }).format(v);

const fmtDateTime = (d: Date) =>
  new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(d);

export default async function AdminRatesPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'ADMIN') redirect('/dashboard');

  const now = new Date();

  // The "current rate" is the most recent rate whose effective_date has passed.
  // This is the same query the server uses when costing a trip on end-trip:
  //   SELECT rate_per_km FROM rate_configs
  //   WHERE effective_date <= trip.start_time
  //   ORDER BY effective_date DESC LIMIT 1
  const current = await prisma.rateConfig.findFirst({
    where: { effectiveDate: { lte: now } },
    orderBy: { effectiveDate: 'desc' },
    include: { createdBy: { select: { name: true } } },
  });

  const history = await prisma.rateConfig.findMany({
    orderBy: { effectiveDate: 'desc' },
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Admin</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Mileage rate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The rate applied to a trip is the most recent rate whose effective date is on or
          before the trip&apos;s start time.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-5">
        <section className="rounded-lg border border-l-4 border-l-brand bg-card p-5 shadow-sm sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current rate
          </p>
          {current ? (
            <>
              <p className="mt-1 text-4xl font-bold tabular-nums text-brand">
                {fmtKes(Number(current.ratePerKm))}
                <span className="ml-1 text-base font-semibold text-muted-foreground">/km</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Effective {fmtDateTime(current.effectiveDate)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Set by {current.createdBy.name}
              </p>
              {current.notes ? (
                <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                  {current.notes}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No rate configured yet. Add one below — trips can&apos;t be costed without it.
            </p>
          )}
        </section>

        <section className="sm:col-span-3">
          <NewRateForm />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          History
        </h2>
        {history.length === 0 ? (
          <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">
            No rate changes yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-brand-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Effective from</th>
                  <th className="px-4 py-2.5 font-medium">Rate</th>
                  <th className="px-4 py-2.5 font-medium">Currency</th>
                  <th className="px-4 py-2.5 font-medium">Set by</th>
                  <th className="px-4 py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((r) => {
                  const isScheduled = r.effectiveDate > now;
                  const isCurrent = current?.id === r.id;
                  return (
                    <tr
                      key={r.id}
                      className={
                        isCurrent
                          ? 'bg-brand-surface/50'
                          : isScheduled
                            ? 'bg-amber-50/50'
                            : ''
                      }
                    >
                      <td className="px-4 py-2.5">
                        {fmtDateTime(r.effectiveDate)}
                        {isScheduled ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                            Scheduled
                          </span>
                        ) : isCurrent ? (
                          <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
                            Current
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">
                        {fmtKes(Number(r.ratePerKm))}/km
                      </td>
                      <td className="px-4 py-2.5">{r.currency}</td>
                      <td className="px-4 py-2.5">{r.createdBy.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.notes ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
