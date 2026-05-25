import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client with the service-role key. Required for:
//   - Generating signed upload URLs against a private Storage bucket
//   - Any operation that must bypass RLS
// NEVER import this from a Client Component or expose the key to the browser.

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) in environment.',
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

export const MPESA_BUCKET = 'mpesa-screenshots';
