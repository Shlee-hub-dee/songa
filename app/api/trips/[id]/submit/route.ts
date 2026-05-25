import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { broadcast, managerTopic } from '@/lib/realtime';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
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
      userId: true,
      status: true,
      amountKes: true,
      user: { select: { managerId: true } },
      payment: { select: { id: true } },
    },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  // Only the officer who owns the trip (or admin) may submit it.
  if (trip.userId !== me.id && me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'You can only submit your own trips' }, { status: 403 });
  }
  if (trip.status !== 'DRAFT') {
    return NextResponse.json(
      { error: `Trip is ${trip.status}; only DRAFT trips can be submitted` },
      { status: 409 },
    );
  }
  if (!trip.payment) {
    return NextResponse.json(
      {
        error: 'Attach at least one M-Pesa payment before submitting for approval.',
        code: 'PAYMENT_REQUIRED',
      },
      { status: 422 },
    );
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Guarded update — if the trip status changed between the read above and
      // the write here, this throws P2025 and we 409 back to the caller.
      const t = await tx.trip.update({
        where: { id: trip.id, status: 'DRAFT' },
        data: { status: 'PENDING', submittedAt: new Date() },
        select: { id: true, userId: true, status: true, submittedAt: true, amountKes: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id,
          entityType: 'Trip',
          entityId: t.id,
          action: 'SUBMITTED',
          oldValues: { status: 'DRAFT' },
          newValues: { status: 'PENDING', submittedAt: t.submittedAt },
        },
      });
      return t;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json(
        { error: 'Trip status changed before we could submit it. Refresh and try again.' },
        { status: 409 },
      );
    }
    console.error('POST /api/trips/[id]/submit failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Best-effort broadcast — the AFTER UPDATE trigger on `trips` is the
  // authoritative source. This API broadcast is duplicative on purpose so
  // managers see the notification immediately even before the DB trigger
  // fans out (and as a fallback if the trigger isn't installed yet).
  const managerId = trip.user.managerId;
  if (managerId) {
    await broadcast({
      topic: managerTopic(managerId),
      event: 'trip:submitted',
      payload: {
        tripId: updated.id,
        officerId: updated.userId,
        submittedAt: updated.submittedAt,
        amountKes: updated.amountKes.toString(),
      },
    });
  }

  return NextResponse.json({ trip: updated }, { status: 200 });
}
