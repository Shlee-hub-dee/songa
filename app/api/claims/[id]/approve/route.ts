import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { broadcast, officerTopic } from '@/lib/realtime';
import { expectedApproverRole, type Role } from '@/lib/roles';

export const runtime = 'nodejs';

export async function PATCH(
  _req: NextRequest,
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

  // No user may approve their own trip — under any circumstance, including ADMIN.
  if (trip.userId === me.id) {
    return NextResponse.json(
      { error: 'You cannot approve your own trip.' },
      { status: 403 },
    );
  }

  // ADMIN can approve ANY trip regardless of organisational unit, manager
  // chain, or role tier — they're the org-wide override. The self-approval
  // rule above still applies to them.
  //
  // Every other approver is held to two rules:
  //   - direct-report only (trip.user.managerId === approver.id)
  //   - role-tier match (e.g. an Agent's trip needs a Zone Supervisor)
  if (me.role !== 'ADMIN') {
    if (trip.user.managerId !== me.id) {
      return NextResponse.json(
        { error: 'You can only approve trips from your direct reports.' },
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
          error: `Only a ${required.replace(/_/g, ' ').toLowerCase()} can approve a ${submitterRole.replace(/_/g, ' ').toLowerCase()}'s trip.`,
          code: 'WRONG_APPROVER_ROLE',
        },
        { status: 403 },
      );
    }
  }

  if (trip.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Trip is ${trip.status}; only PENDING trips can be approved` },
      { status: 409 },
    );
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: trip.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          approverId: me.id,
          approvedAt: new Date(),
        },
        select: {
          id: true,
          userId: true,
          status: true,
          approvedAt: true,
          amountKes: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id,
          entityType: 'Trip',
          entityId: t.id,
          action: 'APPROVED',
          oldValues: { status: 'PENDING' },
          newValues: { status: 'APPROVED', approvedAt: t.approvedAt },
        },
      });
      return t;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json(
        { error: 'Trip status changed before we could approve it. Refresh and try again.' },
        { status: 409 },
      );
    }
    console.error('PATCH /api/claims/[id]/approve failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  await broadcast({
    topic: officerTopic(updated.userId),
    event: 'trip:approved',
    payload: {
      tripId: updated.id,
      newStatus: 'APPROVED',
      approvedAt: updated.approvedAt,
      approverId: me.id,
      amountKes: updated.amountKes.toString(),
    },
  });

  return NextResponse.json({ trip: updated });
}
