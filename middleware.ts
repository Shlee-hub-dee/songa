import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIX = '/dashboard';
const LOGIN_PATH = '/login';
const TRIP_LOG_PATH = '/dashboard/trips/new';

// Roles that are NOT allowed to log trips. Mirrored in app/dashboard/trips/new
// (server guard) and app/api/trips POST (API guard) — three layers of defence.
const NON_LOGGING_ROLES = new Set(['REGIONAL_MANAGER', 'FINANCE_MANAGER', 'ADMIN']);

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
  if (user && isTripLog && role && NON_LOGGING_ROLES.has(role)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
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
