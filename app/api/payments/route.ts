import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const BodySchema = z.object({
  tripId: z.string().min(1, { message: 'tripId is required' }),
  // M-Pesa refs are typically 10-char alphanumeric (e.g. "QHX1234ABC")
  mpesaRef: z
    .string()
    .trim()
    .min(6, { message: 'M-Pesa reference is too short' })
    .max(32, { message: 'M-Pesa reference is too long' })
    .regex(/^[A-Za-z0-9]+$/, {
      message: 'M-Pesa reference must be alphanumeric',
    }),
  amountKes: z.number({ message: 'Amount must be a number' }).positive({
    message: 'Amount must be greater than 0',
  }),
  // International phone formats with spaces or country codes can exceed 20
  // chars (e.g. "+254 712 345 678"). 25 keeps validation strict but doesn't
  // false-reject typical Kenyan / international inputs.
  recipientPhone: z
    .string()
    .trim()
    .min(7, { message: 'Recipient phone is too short' })
    .max(25, { message: 'Recipient phone is too long' }),
  screenshotPath: z
    .string()
    .min(1, { message: 'screenshotPath must not be empty' })
    .optional(),
  paidAt: z
    .string()
    .datetime({ message: 'paidAt must be an ISO datetime' })
    .optional(),
});

export async function POST(req: NextRequest) {
  const authUser = await getAuthedUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const paidBy = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!paidBy || !paidBy.isActive) {
    return NextResponse.json({ error: 'User not provisioned' }, { status: 403 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues
            .map((i) => {
              const field = i.path.join('.');
              return field ? `${field}: ${i.message}` : i.message;
            })
            .join('; ')
        : 'Invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({
    where: { id: body.tripId },
    select: {
      id: true,
      status: true,
      userId: true,
      amountKes: true,
      payment: { select: { id: true } },
    },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }
  if (trip.payment) {
    return NextResponse.json(
      { error: 'A payment is already attached to this trip' },
      { status: 409 },
    );
  }
  // The trip's owner attaches their own M-Pesa evidence pre-submission;
  // finance/admin can also attach (e.g. for back-office corrections).
  const isOwner = trip.userId === paidBy.id;
  const isPrivileged = paidBy.role === 'FINANCE_MANAGER' || paidBy.role === 'ADMIN';
  if (!isOwner && !isPrivileged) {
    return NextResponse.json(
      { error: 'You can only attach payments to your own trips' },
      { status: 403 },
    );
  }
  if (trip.status !== 'DRAFT' && trip.status !== 'APPROVED') {
    return NextResponse.json(
      { error: `Payment cannot be attached while trip is ${trip.status}` },
      { status: 409 },
    );
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.mpesaPayment.create({
        data: {
          tripId: body.tripId,
          mpesaRef: body.mpesaRef.toUpperCase(),
          amountKes: body.amountKes,
          recipientPhone: body.recipientPhone,
          screenshotPath: body.screenshotPath ?? null,
          paidById: paidBy.id,
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: paidBy.id,
          entityType: 'MpesaPayment',
          entityId: created.id,
          action: 'CREATED',
          newValues: {
            tripId: body.tripId,
            mpesaRef: created.mpesaRef,
            amountKes: created.amountKes.toString(),
          },
        },
      });
      return created;
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? '';
      const onMpesaRef = Array.isArray(target)
        ? target.includes('mpesa_ref')
        : String(target).includes('mpesa_ref');
      return NextResponse.json(
        {
          error: onMpesaRef
            ? 'This M-Pesa reference has already been used for another trip.'
            : 'Duplicate value on a unique field.',
          code: 'DUPLICATE_MPESA_REF',
        },
        { status: 409 },
      );
    }
    console.error('POST /api/payments failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
