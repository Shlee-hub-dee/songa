import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { NoRateConfiguredError, computeAmountKes, resolveRateForDate } from '@/lib/rates';
import { canLogTrips, type Role } from '@/lib/roles';

export const runtime = 'nodejs';

const Waypoint = z.object({
  lat: z.number(),
  lng: z.number(),
  ts: z.number().int(),
  accuracy: z.number().nonnegative(),
});

// IMPORTANT: this schema deliberately does NOT accept ratePerKm or amountKes
// from the client. Both are derived server-side from the rate_configs table
// using the trip's startTime.
const BodySchema = z.object({
  type: z.enum([
    'FARMER_ENROLLMENT',
    'GROUP_TRAINING',
    'LOAN_FOLLOWUP',
    'INPUT_DISTRIBUTION',
    'OTHER',
  ]),
  notes: z.string().trim().max(2000).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90).optional(),
  endLng: z.number().min(-180).max(180).optional(),
  distanceKm: z.number().nonnegative().max(1000),
  gpsAccuracyM: z.number().nonnegative().optional(),
  gpsPointCount: z.number().int().nonnegative(),
  gpsTrail: z.array(Waypoint).max(10000).optional(),
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
  if (!canLogTrips(me.role as Role)) {
    return NextResponse.json(
      {
        error: 'Trip logging is not available for your role.',
        code: 'ROLE_CANNOT_LOG_TRIPS',
      },
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

  const startTime = new Date(body.startTime);
  const endTime = body.endTime ? new Date(body.endTime) : null;

  // Resolve the rate as of the trip's START time — never the submission time
  // and never something the client supplies. This matches the spec exactly:
  //   SELECT rate_per_km FROM rate_configs
  //   WHERE effective_date <= trip.start_time
  //   ORDER BY effective_date DESC LIMIT 1
  let resolved;
  try {
    resolved = await resolveRateForDate(startTime);
  } catch (err) {
    if (err instanceof NoRateConfiguredError) {
      return NextResponse.json(
        { error: err.message, code: 'NO_RATE_CONFIGURED' },
        { status: 409 },
      );
    }
    throw err;
  }

  const amountKes = computeAmountKes(body.distanceKm, resolved.ratePerKm);

  const trip = await prisma.$transaction(async (tx) => {
    const created = await tx.trip.create({
      data: {
        userId: me.id,
        type: body.type,
        notes: body.notes ?? null,
        startTime,
        endTime,
        startLat: body.startLat,
        startLng: body.startLng,
        endLat: body.endLat ?? null,
        endLng: body.endLng ?? null,
        distanceKm: body.distanceKm,
        gpsAccuracyM: body.gpsAccuracyM ?? null,
        gpsPointCount: body.gpsPointCount,
        gpsTrail: body.gpsTrail ?? undefined,
        ratePerKm: resolved.ratePerKm,
        amountKes,
        currency: resolved.currency,
        rateConfigId: resolved.rateConfigId,
        status: 'DRAFT',
      },
      select: {
        id: true,
        status: true,
        distanceKm: true,
        ratePerKm: true,
        amountKes: true,
        currency: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: me.id,
        entityType: 'Trip',
        entityId: created.id,
        action: 'CREATED',
        newValues: {
          type: body.type,
          distanceKm: created.distanceKm.toString(),
          ratePerKm: created.ratePerKm.toString(),
          amountKes: created.amountKes.toString(),
          rateConfigId: resolved.rateConfigId,
        },
      },
    });
    return created;
  });

  return NextResponse.json(
    {
      trip: {
        id: trip.id,
        status: trip.status,
        distanceKm: Number(trip.distanceKm),
        ratePerKm: Number(trip.ratePerKm),
        amountKes: Number(trip.amountKes),
        currency: trip.currency,
      },
    },
    { status: 201 },
  );
}
