import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ROLE_LABEL, type Role } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Admin-only directory of provisioned users. Stub: shows a paginated read-only
// list. Editing (role / manager / unit reassignment) is a follow-up — for now
// use scripts/set-user-role.ts on the operator's laptop.
export default async function AdminUsersPage() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) redirect('/login');
  if (me.role !== 'ADMIN') redirect('/dashboard');

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organisationalUnit: true,
      unitLevel: true,
      manager: { select: { name: true } },
      isActive: true,
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    take: 500,
  });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Admin</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} provisioned. Editing is via{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            scripts/set-user-role.ts
          </code>{' '}
          for now.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Unit</th>
              <th className="px-4 py-2.5">Manager</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-brand-surface/40">
                <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-brand-surface px-2 py-0.5 text-xs font-medium text-brand">
                    {ROLE_LABEL[u.role as Role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.organisationalUnit ?? '—'}
                  {u.unitLevel ? (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      ({u.unitLevel})
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.manager?.name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {u.isActive ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                      Inactive
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
