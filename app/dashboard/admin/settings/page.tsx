import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
// Reusing the existing /admin/rates components — per the spec, do not
// overwrite or delete any rate logic, extend it only.
import { NewRateForm } from '../rates/_components/new-rate-form';
import { DATE_TIME, KES_PRECISE } from '../_lib/formatters';

export const dynamic = 'force-dynamic';

// Rate Settings: the canonical destination for rate management. /admin/rates
// is preserved as-is for any existing deep links — the API and form are
// shared. This page surfaces the same current rate + full history and
// uses the same NewRateForm whose POST handler in /api/rates writes the
// rate_config row + an audit_log entry with the admin's user id.
export default async function AdminSettingsPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'ADMIN') redirect('/dashboard');

  const now = new Date();

  // Same query the server uses when costing a trip — for consistency the
  // "current rate" here means the most recent rate whose effective_date has
  // already passed.
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
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">
          Admin · Settings
        </p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          Rate configuration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The rate applied to a trip is the most recent rate whose effective date
          is on or before the trip&apos;s start time. Future-dated rates appear
          in the history below as <span className="font-medium">Scheduled</span>.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-5">
        <section
          aria-label="Current rate"
          className="rounded-lg border border-l-4 border-l-brand bg-card p-5 shadow-sm sm:col-span-2"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current rate
          </p>
          {current ? (
            <>
              <p className="mt-1 text-4xl font-bold tabular-nums text-brand">
                {KES_PRECISE.format(Number(current.ratePerKm))}
                <span className="ml-1 text-base font-semibold text-muted-foreground">
                  /km
                </span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Effective {DATE_TIME.format(current.effectiveDate)}
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
              No rate configured yet. Add one — trips can&apos;t be costed without it.
            </p>
          )}
        </section>

        <section className="sm:col-span-3">
          <NewRateForm />
        </section>
      </div>

      <section className="mt-8" aria-label="Rate history">
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
                  <th className="px-4 py-2.5 font-medium">Rate</th>
                  <th className="px-4 py-2.5 font-medium">Effective date</th>
                  <th className="px-4 py-2.5 font-medium">Set by</th>
                  <th className="px-4 py-2.5 font-medium">Created at</th>
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
                      <td className="px-4 py-2.5 font-medium tabular-nums">
                        {KES_PRECISE.format(Number(r.ratePerKm))}/km
                      </td>
                      <td className="px-4 py-2.5">
                        {DATE_TIME.format(r.effectiveDate)}
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
                      <td className="px-4 py-2.5">{r.createdBy.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {DATE_TIME.format(r.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {r.notes ?? '—'}
                      </td>
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
