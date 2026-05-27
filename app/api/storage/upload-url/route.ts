import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/supabase-server';
import { getSupabaseAdmin, MPESA_BUCKET } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const MAX_BYTES = 600 * 1024; // 500KB target + headroom for compression slop
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const BodySchema = z.object({
  tripId: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(body.contentType)) {
    return NextResponse.json(
      { error: 'Unsupported content type. Use image/jpeg, image/png, or image/webp.' },
      { status: 415 },
    );
  }
  if (body.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${body.size} bytes). Compress to under ${MAX_BYTES} bytes.` },
      { status: 413 },
    );
  }

  const ext =
    body.contentType === 'image/png'
      ? 'png'
      : body.contentType === 'image/webp'
        ? 'webp'
        : 'jpg';
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  // Path is per-trip so finance can find all attempted screenshots for a trip.
  const path = `${body.tripId}/${randomId}.${ext}`;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(MPESA_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    // Supabase Storage uses "the related resource does not exist" both for
    // a missing bucket and a missing object. The bucket is the common case
    // (provisioned via scripts/check-storage-bucket.ts --create), so call
    // that out specifically.
    const rawMsg = error?.message ?? 'Could not create signed upload URL';
    const looksLikeMissingBucket = /not.{0,4}exist|not found|no such/i.test(rawMsg);
    const friendly = looksLikeMissingBucket
      ? `Storage bucket "${MPESA_BUCKET}" is not provisioned. Ask an admin to run scripts/check-storage-bucket.ts --create.`
      : rawMsg;
    console.error('createSignedUploadUrl failed:', rawMsg);
    return NextResponse.json({ error: friendly }, { status: 500 });
  }

  return NextResponse.json({
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
