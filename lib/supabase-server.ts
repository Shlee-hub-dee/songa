import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Auth-aware Supabase client for Server Components and Route Handlers.
// Reads/writes the same cookies as middleware.ts so session is consistent.
export function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Server Components can't mutate cookies; ignore silently. Route
          // Handlers that *do* need to refresh tokens should use middleware
          // or set cookies on the response directly.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Read-only context — fine.
          }
        },
      },
    },
  );
}

export async function getAuthedUser() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
