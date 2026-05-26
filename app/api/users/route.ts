import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ALL_ROLES, type Role, type UnitLevel } from '@/lib/roles';

export const runtime = 'nodejs';

const UNIT_LEVELS: readonly UnitLevel[] = ['ZONE', 'AREA', 'REGION'] as const;

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  role: z.enum(ALL_ROLES as unknown as [Role, ...Role[]]),
  managerEmail: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  organisationalUnit: z.string().trim().max(120).optional().or(z.literal('')),
  unitLevel: z.enum(UNIT_LEVELS as unknown as [UnitLevel, ...UnitLevel[]]).optional(),
});

// POST /api/users
// Admin-only. Sends a Supabase auth invitation to the email and creates the
// matching public.users row in the same transaction-ish flow. The invitee
// receives an email link, sets a password, and signs in.
export async function POST(req: NextRequest) {
  const authUser = await getAuthedUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!me || !me.isActive) {
    return NextResponse.json({ error: 'User not provisioned' }, { status: 403 });
  }
  if (me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can create users.' }, { status: 403 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Resolve optional line manager. We look this up before touching Supabase so
  // a typo doesn't leave us with a dangling auth.users row.
  let managerId: string | null = null;
  if (body.managerEmail) {
    const manager = await prisma.user.findUnique({
      where: { email: body.managerEmail },
      select: { id: true },
    });
    if (!manager) {
      return NextResponse.json(
        { error: `No user with email ${body.managerEmail} exists for --manager-email.` },
        { status: 400 },
      );
    }
    managerId = manager.id;
  }

  const supabase = getSupabaseAdmin();
  const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    body.email,
    { data: { name: body.name } },
  );
  if (inviteErr || !invited?.user) {
    // If the auth user already exists, inviteUserByEmail returns a 422.
    // In that case we still want to create the public.users row, so look up
    // the existing auth user instead of failing the request outright.
    if (inviteErr?.message?.toLowerCase().includes('already')) {
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users.find(
        (u) => (u.email ?? '').toLowerCase() === body.email,
      );
      if (!existing) {
        return NextResponse.json(
          { error: inviteErr.message ?? 'Could not invite user' },
          { status: 500 },
        );
      }
      return upsertProfile({
        supabaseUserId: existing.id,
        email: body.email,
        name: body.name,
        role: body.role,
        managerId,
        organisationalUnit: body.organisationalUnit || null,
        unitLevel: body.unitLevel ?? null,
        actorId: me.id,
        invited: false,
      });
    }
    return NextResponse.json(
      { error: inviteErr?.message ?? 'Could not invite user' },
      { status: 500 },
    );
  }

  return upsertProfile({
    supabaseUserId: invited.user.id,
    email: body.email,
    name: body.name,
    role: body.role,
    managerId,
    organisationalUnit: body.organisationalUnit || null,
    unitLevel: body.unitLevel ?? null,
    actorId: me.id,
    invited: true,
  });
}

async function upsertProfile(args: {
  supabaseUserId: string;
  email: string;
  name: string;
  role: Role;
  managerId: string | null;
  organisationalUnit: string | null;
  unitLevel: UnitLevel | null;
  actorId: string;
  invited: boolean;
}) {
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.upsert({
        where: { email: args.email },
        update: {
          name: args.name,
          role: args.role,
          supabaseUserId: args.supabaseUserId,
          managerId: args.managerId,
          organisationalUnit: args.organisationalUnit,
          unitLevel: args.unitLevel,
        },
        create: {
          email: args.email,
          name: args.name,
          role: args.role,
          supabaseUserId: args.supabaseUserId,
          managerId: args.managerId,
          organisationalUnit: args.organisationalUnit,
          unitLevel: args.unitLevel,
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
          actorId: args.actorId,
          entityType: 'User',
          entityId: created.id,
          action: 'CREATED',
          newValues: {
            email: created.email,
            role: created.role,
            invited: args.invited,
          },
        },
      });
      return created;
    });
    return NextResponse.json({ user, invited: args.invited }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'A user with that email already exists.' },
        { status: 409 },
      );
    }
    console.error('POST /api/users failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
