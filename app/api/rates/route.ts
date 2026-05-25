import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const BodySchema = z.object({
  ratePerKm: z.number().positive('Rate must be greater than 0').max(10000),
  effectiveDate: z.string().datetime({ message: 'effectiveDate must be an ISO datetime' }),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3)
    .default('KES')
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

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
    return NextResponse.json(
      { error: 'Only admins can configure rates' },
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

  const rate = await prisma.$transaction(async (tx) => {
    const created = await tx.rateConfig.create({
      data: {
        ratePerKm: body.ratePerKm,
        currency: body.currency ?? 'KES',
        effectiveDate: new Date(body.effectiveDate),
        notes: body.notes ?? null,
        createdById: me.id,
      },
      select: {
        id: true,
        ratePerKm: true,
        currency: true,
        effectiveDate: true,
        notes: true,
        createdAt: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: me.id,
        entityType: 'RateConfig',
        entityId: created.id,
        action: 'RATE_CHANGED',
        newValues: {
          ratePerKm: created.ratePerKm.toString(),
          currency: created.currency,
          effectiveDate: created.effectiveDate,
        },
      },
    });
    return created;
  });

  return NextResponse.json(
    {
      rate: {
        ...rate,
        ratePerKm: Number(rate.ratePerKm),
      },
    },
    { status: 201 },
  );
}
