import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { KES } from '../_lib/formatters';

export const dynamic = 'force-dynamic';

// Read-only org tree built from manager_id links. Each node also surfaces the
// PENDING trip backlog the person owns (their submissions awaiting approval)
// so an admin can see where work is sitting unfinished in the hierarchy.
export default async function OrgChartPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'ADMIN') redirect('/dashboard');

  const [users, pendingGroups] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        organisationalUnit: true,
        managerId: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.trip.groupBy({
      by: ['userId'],
      where: { status: 'PENDING' },
      _count: { _all: true },
      _sum: { amountKes: true },
    }),
  ]);

  // Index pending stats by userId for O(1) lookup while we build the tree.
  const pendingByUser = new Map<string, { count: number; amount: number }>();
  for (const g of pendingGroups) {
    pendingByUser.set(g.userId, {
      count: g._count._all,
      amount: Number(g._sum.amountKes ?? 0),
    });
  }

  // Build a parent → children index in one pass; roots = no managerId.
  const childrenByParent = new Map<string, typeof users>();
  const roots: typeof users = [];
  for (const u of users) {
    if (u.managerId) {
      const arr = childrenByParent.get(u.managerId) ?? [];
      arr.push(u);
      childrenByParent.set(u.managerId, arr);
    } else {
      roots.push(u);
    }
  }

  // Tupande's intended top of the chain is REGIONAL_MANAGER. Render those at
  // the top, then everything under each. If there are root users whose role
  // isn't REGIONAL_MANAGER (admin, finance, orphans) put them in a separate
  // "Org-wide" group at the very top.
  const regionRoots = roots.filter((r) => r.role === 'REGIONAL_MANAGER');
  const otherRoots = roots.filter((r) => r.role !== 'REGIONAL_MANAGER');

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Admin</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Org chart</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live hierarchy from each user&apos;s manager link. The chips on each
          node show the PENDING trips that person has submitted and the total
          KES tied up in them.
        </p>
      </header>

      {otherRoots.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Org-wide
          </h2>
          <ul className="space-y-1.5">
            {otherRoots.map((r) => (
              <OrgNode
                key={r.id}
                user={r}
                childrenByParent={childrenByParent}
                pendingByUser={pendingByUser}
                depth={0}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {regionRoots.length === 0 && otherRoots.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
          No users to display.
        </p>
      ) : null}

      {regionRoots.map((rm) => {
        const acs = childrenByParent.get(rm.id) ?? [];
        return (
          <section key={rm.id} className="mb-5">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {rm.organisationalUnit ?? rm.name}
            </h2>
            <ul className="space-y-1.5">
              <OrgNode
                user={rm}
                childrenByParent={childrenByParent}
                pendingByUser={pendingByUser}
                depth={0}
              />
            </ul>
            {acs.length === 0 ? null : null}
          </section>
        );
      })}
    </main>
  );
}

type Node = {
  id: string;
  name: string;
  role: string;
  organisationalUnit: string | null;
};

function OrgNode({
  user,
  childrenByParent,
  pendingByUser,
  depth,
}: {
  user: Node;
  childrenByParent: Map<string, Node[]>;
  pendingByUser: Map<string, { count: number; amount: number }>;
  depth: number;
}) {
  const kids = childrenByParent.get(user.id) ?? [];
  const pending = pendingByUser.get(user.id);

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm"
        style={{ marginLeft: depth * 16 }}
      >
        <span className="font-medium text-foreground">{user.name}</span>
        <span className="rounded-full bg-brand-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
          {ROLE_LABEL[user.role as Role] ?? user.role}
        </span>
        {user.organisationalUnit ? (
          <span className="text-xs text-muted-foreground">
            {user.organisationalUnit}
          </span>
        ) : null}
        {pending && pending.count > 0 ? (
          <span
            title="Pending trips submitted by this person"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
          >
            <span className="tabular-nums">{pending.count} pending</span>
            <span className="opacity-60">·</span>
            <span className="tabular-nums">{KES.format(pending.amount)}</span>
          </span>
        ) : null}
      </div>
      {kids.length > 0 ? (
        <ul className="mt-1 space-y-1.5">
          {kids.map((k) => (
            <OrgNode
              key={k.id}
              user={k}
              childrenByParent={childrenByParent}
              pendingByUser={pendingByUser}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
