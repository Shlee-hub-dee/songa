import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'FATAL'] as const;

const BodySchema = z.object({
  issueType: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1, 'Description is required').max(4000),
  appVersion: z.string().trim().max(32).optional(),
  userAgent: z.string().trim().max(1000).optional(),
  url: z.string().trim().max(2000).optional(),
  sessionId: z.string().trim().max(64).optional(),
  // Client-supplied timestamp — we trust it for analytics but also stamp our
  // own createdAt server-side via the Prisma default.
  occurredAt: z.string().datetime().optional(),
  severity: z.enum(SEVERITIES).optional(),
});

export async function POST(req: NextRequest) {
  // Allow anonymous reports — an unauthenticated crash is the worst time to
  // make someone log in. We just record userId as null when there's no session.
  const authUser = await getAuthedUser();
  let localUserId: string | null = null;
  if (authUser) {
    const me = await prisma.user.findUnique({
      where: { supabaseUserId: authUser.id },
      select: { id: true },
    });
    localUserId = me?.id ?? null;
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const report = await prisma.errorReport.create({
    data: {
      userId: localUserId,
      sessionId: body.sessionId ?? null,
      // The form's free-text description is the main payload — we prefix the
      // issue type so it's easy to skim in the DB without joining anything.
      message: `[${body.issueType}] ${body.description}`,
      url: body.url ?? null,
      userAgent: body.userAgent ?? null,
      severity: body.severity ?? 'ERROR',
      metadata: {
        issueType: body.issueType,
        appVersion: body.appVersion ?? null,
        occurredAt: body.occurredAt ?? null,
      },
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ report }, { status: 201 });
}
