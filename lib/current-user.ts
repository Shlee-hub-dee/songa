import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import type { Role } from '@/lib/roles';

export type CurrentUser = {
  id: string;
  supabaseUserId: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  managerId: string | null;
  organisationalUnit: string | null;
  unitLevel: 'ZONE' | 'AREA' | 'REGION' | null;
  region: string | null;
};

// React `cache()` dedupes within a single server render. The dashboard
// layout AND the dashboard page both need the authed user + their Prisma
// profile — wrapping these in `cache()` collapses 2× supabase.auth + 2×
// prisma.findUnique into 1× each per request.

export const getCurrentAuthUser = cache(async () => {
  return getAuthedUser();
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const authUser = await getCurrentAuthUser();
  if (!authUser) return null;

  const row = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: {
      id: true,
      supabaseUserId: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      managerId: true,
      organisationalUnit: true,
      unitLevel: true,
      region: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    supabaseUserId: row.supabaseUserId ?? authUser.id,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    isActive: row.isActive,
    managerId: row.managerId,
    organisationalUnit: row.organisationalUnit,
    unitLevel: row.unitLevel,
    region: row.region,
  };
});
