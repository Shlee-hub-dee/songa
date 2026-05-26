import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { broadcast, officerTopic } from '@/lib/realtime';
import { expectedApproverRole, type Role } from '@/lib/roles';

export const runtime = 'nodejs';

const BodySchema = z.object({
  reason: z.string().trim().min(1, 'A non-empty reason is required').max(2000),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      userId: true,
      user: { select: { id: true, role: true, managerId: true } },
    },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  // Same three rules as approve: no self-action, direct-report only, correct
  // approver role tier.
  if (trip.userId === me.id) {
    return NextResponse.json(
      { error: 'You cannot reject your own trip.' },
      { status: 403 },
    );
  }
  if (trip.user.managerId !== me.id) {
    return NextResponse.json(
      { error: 'You can only reject trips from your direct reports.' },
      { status: 403 },
    );
  }
  const submitterRole = trip.user.role as Role;
  const required = expectedApproverRole(submitterRole);
  if (!required) {
    return NextResponse.json(
      { error: 'This role cannot submit trips for approval.' },
      { status: 403 },
    );
  }
  if (me.role !== required) {
    return NextResponse.json(
      {
        error: `Only a ${required.replace(/_/g, ' ').toLowerCase()} can reject a ${submitterRole.replace(/_/g, ' ').toLowerCase()}'s trip.`,
        code: 'WRONG_APPROVER_ROLE',
      },
      { status: 403 },
    );
  }

  if (trip.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Trip is ${trip.status}; only PENDING trips can be rejected` },
      { status: 409 },
    );
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: trip.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          approverId: me.id,
          rejectedAt: new Date(),
          rejectionReason: body.reason,
        },
        select: {
          id: true,
          userId: true,
          status: true,
          rejectedAt: true,
          rejectionReason: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id,
          entityType: 'Trip',
          entityId: t.id,
          action: 'REJECTED',
          oldValues: { status: 'PENDING' },
          newValues: {
            status: 'REJECTED',
            rejectedAt: t.rejectedAt,
            rejectionReason: t.rejectionReason,
          },
        },
      });
      return t;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json(
        { error: 'Trip status changed before we could reject it. Refresh and try again.' },
        { status: 409 },
      );
    }
    console.error('PATCH /api/claims/[id]/reject failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  await broadcast({
    topic: officerTopic(updated.userId),
    event: 'trip:rejected',
    payload: {
      tripId: updated.id,
      newStatus: 'REJECTED',
      rejectedAt: updated.rejectedAt,
      rejectionReason: updated.rejectionReason,
      approverId: me.id,
    },
  });

  return NextResponse.json({ trip: updated });
}
