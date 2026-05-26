import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIX = '/dashboard';
const LOGIN_PATH = '/login';
const TRIP_LOG_PATH = '/dashboard/trips/new';

// Roles that are NOT allowed to log trips, with their role-home destination
// when redirected. Mirrors lib/roles.ts → ROLE_HOME — duplicated here because
// middleware can't import from app code (edge runtime, different module
// graph). Keep in sync when adding new roles.
const NON_LOGGING_HOMES: Record<string, string> = {
  REGIONAL_MANAGER: '/dashboard/approvals',
  FINANCE_MANAGER: '/dashboard/finance',
  ADMIN: '/dashboard/admin/rates',
};

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = pathname.startsWith(PROTECTED_PREFIX);
  const isTripLog = pathname === TRIP_LOG_PATH || pathname.startsWith(`${TRIP_LOG_PATH}/`);

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

  // getUser() validates the JWT with Supabase Auth (vs getSession() which trusts the cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = LOGIN_PATH;
    redirectUrl.searchParams.set('redirectedFrom', pathname + search);
    return NextResponse.redirect(redirectUrl);
  }

  // Surface the app role (stored in app_metadata.role — server-set, not user-mutable)
  // so downstream Server Components/Route Handlers can authorize without re-decoding the JWT.
  const role = user ? ((user.app_metadata?.role as string | undefined) ?? '') : '';
  if (user) {
    response.headers.set('x-user-id', user.id);
    response.headers.set('x-user-role', role);
  }

  // Role gate for /dashboard/trips/new. Only checked when JWT-embedded role is
  // populated — if it's missing (e.g. user freshly provisioned), we let the
  // server-side page guard handle it using the Prisma user row as truth.
  // Blocked roles are sent to their role-home (e.g. RM → /dashboard/approvals)
  // with ?blocked=trip-log so the destination page can render the notice.
  if (user && isTripLog && role && role in NON_LOGGING_HOMES) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = NON_LOGGING_HOMES[role];
    redirectUrl.search = '';
    redirectUrl.searchParams.set('blocked', 'trip-log');
    redirectUrl.searchParams.set('role', role);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Run on all routes except Next internals and static assets; route logic above
  // decides whether to redirect.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
