import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIX = '/dashboard';
const LOGIN_PATH = '/login';
const TRIP_LOG_PATH = '/dashboard/trips/new';

// Per-role landing page. Mirrors lib/roles.ts → ROLE_HOME — duplicated here
// because middleware can't import from app code (edge runtime, different
// module graph). Keep in sync when adding new roles.
const ROLE_HOME: Record<string, string> = {
  TUPANDE_AGENT: '/dashboard/officer',
  ZONE_SUPERVISOR: '/dashboard/approvals',
  AREA_COORDINATOR: '/dashboard/approvals',
  REGIONAL_MANAGER: '/dashboard/approvals',
  FINANCE_MANAGER: '/dashboard/finance',
  ADMIN: '/dashboard/admin',
};

// Prefix-based role gates: when a user with role X tries to enter a section
// reserved for role set Y, middleware redirects them to their own role home
// with ?blocked=<area>. The page-level guards continue to enforce these
// same rules from the Prisma source of truth — middleware is the fast path,
// pages are authoritative.
//
// Each entry: prefix → set of roles that ARE allowed in.
const SECTION_ACCESS: { prefix: string; allowed: Set<string>; tag: string }[] = [
  {
    prefix: '/dashboard/admin',
    allowed: new Set(['ADMIN']),
    tag: 'admin-only',
  },
  {
    prefix: '/dashboard/finance',
    allowed: new Set(['FINANCE_MANAGER', 'ADMIN']),
    tag: 'finance-only',
  },
  {
    prefix: '/dashboard/approvals',
    allowed: new Set([
      'ZONE_SUPERVISOR',
      'AREA_COORDINATOR',
      'REGIONAL_MANAGER',
      'ADMIN',
    ]),
    tag: 'approvers-only',
  },
];

// Roles that cannot create trips. Trip-log block redirects them to their
// role home with ?blocked=trip-log; the destination page renders the
// "Action not available for your role" notice.
const NON_LOGGING_ROLES = new Set(['REGIONAL_MANAGER', 'FINANCE_MANAGER', 'ADMIN']);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = pathname.startsWith(PROTECTED_PREFIX);
  const isTripLog = matchesPrefix(pathname, TRIP_LOG_PATH);

  // Response we'll return; the Supabase client may mutate cookies on it
  // (e.g. when it refreshes an expired access token).
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the JWT with Supabase Auth (vs getSession() which
  // trusts the cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = LOGIN_PATH;
    redirectUrl.searchParams.set('redirectedFrom', pathname + search);
    return NextResponse.redirect(redirectUrl);
  }

  // Surface the app role (stored in app_metadata.role — server-set, not
  // user-mutable) so downstream Server Components/Route Handlers can
  // authorize without re-decoding the JWT.
  const role = user ? ((user.app_metadata?.role as string | undefined) ?? '') : '';
  if (user) {
    response.headers.set('x-user-id', user.id);
    response.headers.set('x-user-role', role);
  }

  // The JWT-embedded role is the fast-path source. When it's missing (e.g.
  // user freshly provisioned, role assigned but JWT not yet refreshed), we
  // skip middleware gates and let the page-level Prisma check authoritate.
  if (!user || !role) return response;

  // ── Trip-log block ──
  if (isTripLog && NON_LOGGING_ROLES.has(role)) {
    const home = ROLE_HOME[role] ?? '/dashboard';
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = home;
    redirectUrl.search = '';
    redirectUrl.searchParams.set('blocked', 'trip-log');
    redirectUrl.searchParams.set('role', role);
    return NextResponse.redirect(redirectUrl);
  }

  // ── Section-prefix gates ──
  // Walk in declaration order — first match wins. We don't expect prefixes
  // to overlap (admin / finance / approvals are disjoint) but the loop
  // shape makes it easy to add more sections later.
  for (const section of SECTION_ACCESS) {
    if (!matchesPrefix(pathname, section.prefix)) continue;
    if (section.allowed.has(role)) break;
    const home = ROLE_HOME[role] ?? '/dashboard';
    // Don't redirect-loop: if the user's home is already inside the section
    // they tried to enter (should never happen given SECTION_ACCESS), fall
    // through to a generic /dashboard landing.
    const safeHome = matchesPrefix(home, section.prefix) ? '/dashboard' : home;
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = safeHome;
    redirectUrl.search = '';
    redirectUrl.searchParams.set('blocked', section.tag);
    redirectUrl.searchParams.set('role', role);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Only run on routes the middleware actually needs to gate:
  //   - /dashboard/* (auth + role-section + trip-log block)
  //   - /login      (so the supabase client can refresh expired tokens before
  //                  the page renders the login form)
  // API routes do their own auth via getAuthedUser() inside the route, so we
  // don't need to pay the supabase.auth.getUser() round-trip on every fetch.
  // Static assets and _next internals are skipped entirely.
  matcher: ['/dashboard/:path*', '/login'],
};
