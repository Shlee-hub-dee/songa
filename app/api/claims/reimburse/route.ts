import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { broadcast, officerTopic } from '@/lib/realtime';

export const runtime = 'nodejs';

const BodySchema = z.object({
  tripIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function PATCH(req: NextRequest) {
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
  if (me.role !== 'FINANCE' && me.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Only finance or admin can reimburse claims' },
      { status: 403 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const requestedIds = Array.from(new Set(body.tripIds));
  const reimbursedAt = new Date();

  // Single transaction: read eligible trips, flip them, write audits. The
  // `status: 'APPROVED'` filter on both the read and the updateMany guarantees
  // we never double-pay a trip that raced into REIMBURSED between fetch and update.
  const { eligible, skipped } = await prisma.$transaction(async (tx) => {
    const found = await tx.trip.findMany({
      where: { id: { in: requestedIds }, status: 'APPROVED' },
      select: { id: true, userId: true, amountKes: true },
    });
    const eligibleIds = found.map((t) => t.id);
    const skippedIds = requestedIds.filter((id) => !eligibleIds.includes(id));

    if (eligibleIds.length === 0) {
      return { eligible: [], skipped: skippedIds };
    }

    await tx.trip.updateMany({
      where: { id: { in: eligibleIds }, status: 'APPROVED' },
      data: { status: 'REIMBURSED', reimbursedAt },
    });

    await tx.auditLog.createMany({
      data: found.map((t) => ({
        actorId: me.id,
        entityType: 'Trip',
        entityId: t.id,
        action: 'REIMBURSED',
        oldValues: { status: 'APPROVED' },
        newValues: {
          status: 'REIMBURSED',
          reimbursedAt,
          amountKes: t.amountKes.toString(),
        },
      })),
    });

    return { eligible: found, skipped: skippedIds };
  });

  // Broadcasts happen after the transaction commits so subscribers never see
  // a notification for a row that's actually rolled back. Promise.allSettled
  // so a single Realtime hiccup doesn't fail the whole batch.
  if (eligible.length > 0) {
    await Promise.allSettled(
      eligible.map((t) =>
        broadcast({
          topic: officerTopic(t.userId),
          event: 'trip:reimbursed',
          payload: {
            tripId: t.id,
            newStatus: 'REIMBURSED',
            reimbursedAt,
            amountKes: t.amountKes.toString(),
            actorId: me.id,
          },
        }),
      ),
    );
  }

  return NextResponse.json({
    reimbursed: eligible.map((t) => t.id),
    skipped,
    reimbursedAt: reimbursedAt.toISOString(),
  });
}
