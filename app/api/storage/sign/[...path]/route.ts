import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';
import { getSupabaseAdmin, MPESA_BUCKET } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const SIGN_TTL_SECONDS = 60 * 60; // 1 hour

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
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

  const storagePath = (params.path ?? []).join('/');
  if (!storagePath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }
  // Defensive: stop traversal attempts before they reach Supabase.
  if (storagePath.includes('..') || storagePath.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Files are stored under "<tripId>/<uuid>.<ext>" — the first segment is the
  // trip ID we use to authorize access.
  const tripId = params.path[0];
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      userId: true,
      user: { select: { managerId: true } },
      payment: { select: { screenshotPath: true } },
    },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  const isOwner = trip.userId === me.id;
  const isManager = trip.user.managerId === me.id;
  const isPrivileged = me.role === 'FINANCE_MANAGER' || me.role === 'ADMIN';
  if (!isOwner && !isManager && !isPrivileged) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Only sign the screenshot actually attached to this trip — prevents
  // someone with valid access to one trip from probing arbitrary objects.
  if (trip.payment?.screenshotPath !== storagePath) {
    return NextResponse.json({ error: 'File not found for this trip' }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(MPESA_BUCKET)
    .createSignedUrl(storagePath, SIGN_TTL_SECONDS);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not create signed URL' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + SIGN_TTL_SECONDS * 1000).toISOString(),
  });
}
