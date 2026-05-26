import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ROLE_LABEL, type Role } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Read-only org tree rendered server-side from manager_id parent links. Good
// enough for v1 — interactive expand/collapse + drag-to-reassign is a follow-up.
export default async function OrgChartPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'ADMIN') redirect('/dashboard');

  const all = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      organisationalUnit: true,
      managerId: true,
    },
    orderBy: { name: 'asc' },
  });

  // Build a parent → children index in one pass.
  const childrenByParent = new Map<string, typeof all>();
  const roots: typeof all = [];
  for (const u of all) {
    if (u.managerId) {
      const arr = childrenByParent.get(u.managerId) ?? [];
      arr.push(u);
      childrenByParent.set(u.managerId, arr);
    } else {
      roots.push(u);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Admin</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Org chart</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live hierarchy based on each user&apos;s manager link.
        </p>
      </header>

      {roots.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
          No users with manager unset — the tree has no roots.
        </p>
      ) : (
        <ul className="space-y-2">
          {roots.map((r) => (
            <OrgNode key={r.id} user={r} childrenByParent={childrenByParent} depth={0} />
          ))}
        </ul>
      )}
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
  depth,
}: {
  user: Node;
  childrenByParent: Map<string, Node[]>;
  depth: number;
}) {
  const kids = childrenByParent.get(user.id) ?? [];
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
          <span className="text-xs text-muted-foreground">{user.organisationalUnit}</span>
        ) : null}
      </div>
      {kids.length > 0 ? (
        <ul className="mt-1 space-y-1.5">
          {kids.map((k) => (
            <OrgNode key={k.id} user={k} childrenByParent={childrenByParent} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
