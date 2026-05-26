/**
 * Provision or update a Songa user.
 *
 *   npx tsx scripts/set-user-role.ts \
 *     --email sasaka4@gmail.com \
 *     --name "Doreen Sasaka" \
 *     --role ADMIN
 *
 * What it does:
 *   1. Finds the matching auth.users row in Supabase (by email).
 *   2. Upserts the public.users row keyed on email, setting role and
 *      linking supabase_user_id so /dashboard role resolution works.
 *
 * Prerequisite: the user must already exist in Supabase Authentication.
 * Create them via Supabase Dashboard -> Authentication -> Users -> Add user
 * (or rely on first-time sign-up if you've enabled email signups).
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeDbUrl } from '../lib/db-url';

type Role = 'FIELD_OFFICER' | 'MANAGER' | 'FINANCE' | 'ADMIN';
const ROLES: Role[] = ['FIELD_OFFICER', 'MANAGER', 'FINANCE', 'ADMIN'];

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = 'true';
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function die(msg: string): never {
  console.error(`\nx ${msg}\n`);
  process.exit(1);
}

async function findAuthUserByEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any, any, any>,
  email: string,
): Promise<{ id: string; email: string } | null> {
  // Supabase admin SDK paginates; for a small org one page is enough.
  // Bump perPage / loop if you ever cross 1000 auth users.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) die(`Failed to list auth users: ${error.message}`);
  const match = data.users.find(
    (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
  );
  if (!match) return null;
  return { id: match.id, email: match.email ?? email };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.email ?? '').trim();
  const name = (args.name ?? '').trim();
  const role = (args.role ?? '').trim().toUpperCase() as Role;

  if (!email) die('Missing --email');
  if (!name) die('Missing --name (used when creating the row)');
  if (!ROLES.includes(role)) die(`--role must be one of ${ROLES.join(', ')}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!supabaseUrl) die('NEXT_PUBLIC_SUPABASE_URL not set (check .env.local)');
  if (!serviceKey) die('SUPABASE_SERVICE_ROLE_KEY not set (check .env.local)');
  if (!dbUrl) die('DATABASE_URL not set (check .env.local)');

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Looking up Supabase auth user for ${email}...`);
  const authUser = await findAuthUserByEmail(supabase, email);
  if (!authUser) {
    die(
      `No auth.users row found for ${email}. ` +
        `Create them in Supabase Dashboard -> Authentication -> Users first, then re-run.`,
    );
  }
  console.log(`  -> auth UUID: ${authUser.id}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeDbUrl(dbUrl) }),
  });

  try {
    const before = await prisma.user.findUnique({ where: { email } });
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        role,
        supabaseUserId: authUser.id,
        name,
      },
      create: {
        email,
        name,
        role,
        supabaseUserId: authUser.id,
      },
      select: { id: true, email: true, name: true, role: true, supabaseUserId: true },
    });

    console.log(`\n${before ? 'Updated' : 'Created'} public.users row:`);
    console.log(`  id:               ${user.id}`);
    console.log(`  email:            ${user.email}`);
    console.log(`  name:             ${user.name}`);
    console.log(`  role:             ${user.role}`);
    console.log(`  supabase_user_id: ${user.supabaseUserId}`);
    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nFailed:', err);
  process.exit(1);
});
