import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local',
  );
}

// Browser-side Supabase client. Session is persisted in cookies (via @supabase/ssr)
// so that middleware and Server Components can read it.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export type SongaRole = 'FIELD_OFFICER' | 'MANAGER' | 'FINANCE' | 'ADMIN';
