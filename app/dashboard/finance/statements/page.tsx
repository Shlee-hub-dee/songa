import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

// Per-officer reimbursement statement view. v1 is the totals roll-up; the
// detailed per-trip breakdown + printable PDF export is a follow-up.
export default async function OfficerStatementsPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'FINANCE_MANAGER' && me.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  // Sum amount_kes per officer for REIMBURSED trips (lifetime).
  // For period filtering, swap to a parameterised query with an
  // approvedAt / reimbursedAt range — left as a follow-up.
  const grouped = await prisma.trip.groupBy({
    by: ['userId'],
    where: { status: 'REIMBURSED' },
    _sum: { amountKes: true },
    _count: { _all: true },
  });

  const officers = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, role: true, organisationalUnit: true },
  });
  const byId = new Map(officers.map((o) => [o.id, o]));

  const rows = grouped
    .map((g) => ({
      officer: byId.get(g.userId),
      total: Number(g._sum.amountKes ?? 0),
      count: g._count._all,
    }))
    .filter((r) => r.officer)
    .sort((a, b) => b.total - a.total);

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Finance</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          Officer statements
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lifetime disbursement totals per officer. {rows.length} with at least one
          reimbursed claim.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
          No reimbursed claims yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
              <tr>
                <th className="px-4 py-2.5">Officer</th>
                <th className="px-4 py-2.5">Unit</th>
                <th className="px-4 py-2.5 text-right">Claims</th>
                <th className="px-4 py-2.5 text-right">Total disbursed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.officer!.id} className="hover:bg-brand-surface/40">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.officer!.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.officer!.organisationalUnit ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-brand">
                    {KES.format(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
