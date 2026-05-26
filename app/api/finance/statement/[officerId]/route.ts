import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { type Role } from '@/lib/roles';

export const runtime = 'nodejs';

// GET /api/finance/statement/[officerId]
// FINANCE_MANAGER / ADMIN only. Returns the full audit-style statement for
// one officer: every trip they've logged (any status) plus every M-Pesa
// payment row that involves them (either paid by them or paid to them).
//
// Outstanding balance = sum of amount_kes for APPROVED trips that are not
// yet REIMBURSED. This mirrors what the reimbursement queue shows.
export async function GET(
  _req: NextRequest,
  { params }: { params: { officerId: string } },
) {
  const authUser = await getAuthedUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { role: true, isActive: true },
  });
  if (!me || !me.isActive) {
    return NextResponse.json({ error: 'User not provisioned' }, { status: 403 });
  }
  if (me.role !== 'FINANCE_MANAGER' && me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const officer = await prisma.user.findUnique({
    where: { id: params.officerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      organisationalUnit: true,
      manager: { select: { name: true } },
    },
  });
  if (!officer) {
    return NextResponse.json({ error: 'Officer not found' }, { status: 404 });
  }

  const [trips, payments] = await Promise.all([
    prisma.trip.findMany({
      where: { userId: params.officerId },
      select: {
        id: true,
        type: true,
        status: true,
        distanceKm: true,
        amountKes: true,
        startTime: true,
        submittedAt: true,
        approvedAt: true,
        reimbursedAt: true,
        rejectedAt: true,
      },
      orderBy: { startTime: 'desc' },
    }),
    // Payments where this officer is either the payer (their own M-Pesa fare
    // evidence) or the recipient (finance disbursement). The schema only has
    // paidById, but the recipient is the trip owner, so we resolve "received"
    // payments by joining through the trip.
    prisma.mpesaPayment.findMany({
      where: {
        OR: [
          { paidById: params.officerId },
          { trip: { userId: params.officerId } },
        ],
      },
      select: {
        id: true,
        mpesaRef: true,
        amountKes: true,
        recipientPhone: true,
        paidAt: true,
        paidById: true,
        trip: { select: { id: true, userId: true } },
      },
      orderBy: { paidAt: 'desc' },
    }),
  ]);

  const outstandingTrips = trips.filter((t) => t.status === 'APPROVED');
  const outstandingBalance = outstandingTrips.reduce(
    (s, t) => s + Number(t.amountKes),
    0,
  );
  const lifetimeReimbursed = trips
    .filter((t) => t.status === 'REIMBURSED')
    .reduce((s, t) => s + Number(t.amountKes), 0);

  return NextResponse.json({
    officer: {
      id: officer.id,
      name: officer.name,
      email: officer.email,
      phone: officer.phone,
      role: officer.role as Role,
      organisationalUnit: officer.organisationalUnit,
      managerName: officer.manager?.name ?? null,
    },
    summary: {
      outstandingBalance,
      lifetimeReimbursed,
      totalTrips: trips.length,
      pendingTripsCount: outstandingTrips.length,
    },
    trips: trips.map((t) => ({
      id: t.id,
      typeLabel: TRIP_TYPE_LABEL[t.type as TripType],
      status: t.status,
      distanceKm: Number(t.distanceKm),
      amountKes: Number(t.amountKes),
      startTime: t.startTime.toISOString(),
      submittedAt: t.submittedAt?.toISOString() ?? null,
      approvedAt: t.approvedAt?.toISOString() ?? null,
      reimbursedAt: t.reimbursedAt?.toISOString() ?? null,
      rejectedAt: t.rejectedAt?.toISOString() ?? null,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      mpesaRef: p.mpesaRef,
      amountKes: Number(p.amountKes),
      recipientPhone: p.recipientPhone,
      paidAt: p.paidAt.toISOString(),
      direction:
        p.paidById === params.officerId ? ('paid-out' as const) : ('received' as const),
      tripId: p.trip.id,
    })),
  });
}
