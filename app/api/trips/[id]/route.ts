import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { type Role } from '@/lib/roles';

export const runtime = 'nodejs';

// GET /api/trips/[id]
// Returns the full trip detail (including gpsTrail) for an authenticated
// viewer who can legitimately see it.
//
// Visibility rules mirror the rest of the app:
//   - The trip owner can see their own trips.
//   - The owner's manager (any tier up the chain) can see them.
//   - ADMIN and FINANCE_MANAGER can see anything.
export async function GET(
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
      type: true,
      status: true,
      distanceKm: true,
      ratePerKm: true,
      amountKes: true,
      currency: true,
      startTime: true,
      endTime: true,
      submittedAt: true,
      approvedAt: true,
      rejectedAt: true,
      reimbursedAt: true,
      rejectionReason: true,
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      gpsAccuracyM: true,
      gpsPointCount: true,
      gpsTrail: true,
      notes: true,
      user: {
        select: {
          id: true,
          name: true,
          role: true,
          organisationalUnit: true,
          managerId: true,
        },
      },
      approver: { select: { name: true } },
      payment: {
        select: {
          mpesaRef: true,
          amountKes: true,
          recipientPhone: true,
          paidAt: true,
        },
      },
    },
  });

  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  const role = me.role as Role;
  const isOwner = trip.user.id === me.id;
  const isManager = trip.user.managerId === me.id;
  const isPrivileged = role === 'ADMIN' || role === 'FINANCE_MANAGER';
  if (!isOwner && !isManager && !isPrivileged) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    trip: {
      id: trip.id,
      typeLabel: TRIP_TYPE_LABEL[trip.type as TripType],
      status: trip.status,
      distanceKm: Number(trip.distanceKm),
      ratePerKm: Number(trip.ratePerKm),
      amountKes: Number(trip.amountKes),
      currency: trip.currency,
      startTime: trip.startTime.toISOString(),
      endTime: trip.endTime?.toISOString() ?? null,
      submittedAt: trip.submittedAt?.toISOString() ?? null,
      approvedAt: trip.approvedAt?.toISOString() ?? null,
      rejectedAt: trip.rejectedAt?.toISOString() ?? null,
      reimbursedAt: trip.reimbursedAt?.toISOString() ?? null,
      rejectionReason: trip.rejectionReason,
      notes: trip.notes,
      start: { lat: Number(trip.startLat), lng: Number(trip.startLng) },
      end:
        trip.endLat != null && trip.endLng != null
          ? { lat: Number(trip.endLat), lng: Number(trip.endLng) }
          : null,
      gpsAccuracyM: trip.gpsAccuracyM != null ? Number(trip.gpsAccuracyM) : null,
      gpsPointCount: trip.gpsPointCount,
      gpsTrail: trip.gpsTrail,
      officer: {
        name: trip.user.name,
        role: trip.user.role,
        organisationalUnit: trip.user.organisationalUnit,
      },
      approverName: trip.approver?.name ?? null,
      payment: trip.payment
        ? {
            mpesaRef: trip.payment.mpesaRef,
            amountKes: Number(trip.payment.amountKes),
            recipientPhone: trip.payment.recipientPhone,
            paidAt: trip.payment.paidAt.toISOString(),
          }
        : null,
    },
  });
}
