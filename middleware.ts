import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIX = '/dashboard';
const LOGIN_PATH = '/login';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = pathname.startsWith(PROTECTED_PREFIX);

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
  if (user) {
    const role = (user.app_metadata?.role as string | undefined) ?? '';
    response.headers.set('x-user-id', user.id);
    response.headers.set('x-user-role', role);
  }

  return response;
}

export const config = {
  // Run on all routes except Next internals and static assets; route logic above
  // decides whether to redirect.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
