import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ROLE_HOME: Record<string, string> = {
  FIELD_OFFICER: '/dashboard/officer',
  MANAGER: '/dashboard/approvals',
  FINANCE: '/dashboard/finance',
  ADMIN: '/dashboard/admin/rates',
};

export default async function DashboardIndex() {
  const authUser = await getAuthedUser();
  if (!authUser) redirect('/login');

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true },
  });

  redirect(ROLE_HOME[profile?.role ?? ''] ?? '/dashboard/officer');
}
