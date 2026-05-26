import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { ALL_ROLES, type Role, type UnitLevel } from '@/lib/roles';

export const runtime = 'nodejs';

const UNIT_LEVELS: readonly UnitLevel[] = ['ZONE', 'AREA', 'REGION'] as const;

const PatchSchema = z
  .object({
    role: z.enum(ALL_ROLES as unknown as [Role, ...Role[]]).optional(),
    managerEmail: z.string().trim().toLowerCase().email().nullable().optional(),
    organisationalUnit: z.string().trim().max(120).nullable().optional(),
    unitLevel: z
      .enum(UNIT_LEVELS as unknown as [UnitLevel, ...UnitLevel[]])
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.role !== undefined ||
      v.managerEmail !== undefined ||
      v.organisationalUnit !== undefined ||
      v.unitLevel !== undefined,
    { message: 'At least one field must be provided.' },
  );

async function requireAdmin() {
  const authUser = await getAuthedUser();
  if (!authUser) return { error: 'Unauthorized' as const, status: 401 as const };
  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!me || !me.isActive)
    return { error: 'User not provisioned' as const, status: 403 as const };
  if (me.role !== 'ADMIN')
    return { error: 'Only admins can change users.' as const, status: 403 as const };
  return { me };
}

// PATCH /api/users/[id]
// Admin-only. Updates role / manager / unit. Cannot change supabaseUserId or
// email through this route (those flow from Supabase Auth + invitation).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const gate = await requireAdmin();
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const me = gate.me;

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Resolve manager-by-email (or explicit null to detach).
  let managerIdUpdate: { managerId: string | null } | Record<string, never> = {};
  if (body.managerEmail !== undefined) {
    if (body.managerEmail === null || body.managerEmail === '') {
      managerIdUpdate = { managerId: null };
    } else {
      const mgr = await prisma.user.findUnique({
        where: { email: body.managerEmail },
        select: { id: true },
      });
      if (!mgr) {
        return NextResponse.json(
          { error: `No user with email ${body.managerEmail}.` },
          { status: 400 },
        );
      }
      if (mgr.id === params.id) {
        return NextResponse.json(
          { error: 'A user cannot be their own manager.' },
          { status: 400 },
        );
      }
      managerIdUpdate = { managerId: mgr.id };
    }
  }

  const before = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, managerId: true, organisationalUnit: true, unitLevel: true },
  });
  if (!before) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: params.id },
      data: {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...managerIdUpdate,
        ...(body.organisationalUnit !== undefined
          ? { organisationalUnit: body.organisationalUnit || null }
          : {}),
        ...(body.unitLevel !== undefined ? { unitLevel: body.unitLevel } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        managerId: true,
        organisationalUnit: true,
        unitLevel: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: me.id,
        entityType: 'User',
        entityId: u.id,
        action: body.role !== undefined ? 'ROLE_CHANGED' : 'UPDATED',
        oldValues: {
          role: before.role,
          managerId: before.managerId,
          organisationalUnit: before.organisationalUnit,
          unitLevel: before.unitLevel,
        },
        newValues: {
          role: u.role,
          managerId: u.managerId,
          organisationalUnit: u.organisationalUnit,
          unitLevel: u.unitLevel,
        },
      },
    });
    return u;
  });

  return NextResponse.json({ user: updated });
}

// DELETE /api/users/[id]
// Admin-only soft delete: sets isActive = false. The auth.users row stays
// (deleting it would invalidate audit_log foreign keys + history). The user
// can no longer sign in to the dashboard because every protected page
// re-checks isActive.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const gate = await requireAdmin();
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const me = gate.me;

  if (params.id === me.id) {
    return NextResponse.json(
      { error: 'You cannot deactivate yourself.' },
      { status: 400 },
    );
  }

  const before = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, isActive: true },
  });
  if (!before) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }
  if (!before.isActive) {
    return NextResponse.json({ user: { id: before.id, isActive: false } });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: params.id },
      data: { isActive: false },
      select: { id: true, email: true, isActive: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: me.id,
        entityType: 'User',
        entityId: u.id,
        action: 'DELETED',
        oldValues: { isActive: true },
        newValues: { isActive: false },
      },
    });
    return u;
  });

  return NextResponse.json({ user: updated });
}
