import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { type Role } from '@/lib/roles';
import { AddUserButton } from './_components/add-user-button';
import { UsersTable, type UserRow } from './_components/users-table';

export const dynamic = 'force-dynamic';

// Admin-only directory of provisioned users. Pulls trips count + joined date
// per user, plus a manager-options list used by both the row dropdowns and
// the Add User modal. Edits / deletions / invites flow through /api/users.
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
      manager: { select: { email: true, name: true } },
      isActive: true,
      createdAt: true,
      _count: { select: { trips: true } },
    },
    orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    take: 1000,
  });

  // Managers list = anyone who is at SUPERVISOR or above. Used in both row
  // and Add-User dropdowns.
  const managerOptions = users
    .filter(
      (u) =>
        u.isActive &&
        ['ZONE_SUPERVISOR', 'AREA_COORDINATOR', 'REGIONAL_MANAGER', 'ADMIN'].includes(
          u.role,
        ),
    )
    .map((u) => ({ email: u.email, name: `${u.name} (${u.role})` }));

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    organisationalUnit: u.organisationalUnit,
    unitLevel: u.unitLevel,
    managerEmail: u.manager?.email ?? null,
    managerName: u.manager?.name ?? null,
    tripsCount: u._count.trips,
    joinedAtIso: u.createdAt.toISOString(),
    isActive: u.isActive,
  }));

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand">Admin</p>
          <h1 className="text-2xl font-bold leading-tight text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} provisioned · {rows.filter((u) => u.isActive).length} active.
            Changes save immediately and are written to the audit log.
          </p>
        </div>
        <AddUserButton managerOptions={managerOptions} />
      </header>

      <UsersTable rows={rows} managerOptions={managerOptions} />
    </main>
  );
}
