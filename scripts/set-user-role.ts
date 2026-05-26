/**
 * Provision or update a Songa user.
 *
 *   npx tsx scripts/set-user-role.ts \
 *     --email sasaka4@gmail.com \
 *     --name "Doreen Sasaka" \
 *     --role ADMIN
 *
 *   # field-staff form (manager + unit context for the approval chain)
 *   npx tsx scripts/set-user-role.ts \
 *     --email new.agent@x.com \
 *     --name "Jane Doe" \
 *     --role TUPANDE_AGENT \
 *     --manager-email peter.macharia@tupande.dev \
 *     --unit "Nakuru West Zone" \
 *     --level ZONE
 *
 * What it does:
 *   1. Finds the matching auth.users row in Supabase (by email).
 *   2. Optionally resolves the line manager by email.
 *   3. Upserts the public.users row keyed on email, setting role, supabase
 *      link, manager, and (if supplied) organisationalUnit + unitLevel.
 *
 * Prerequisite: the user must already exist in Supabase Authentication.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeDbUrl } from '../lib/db-url';

import { ALL_ROLES, type Role, type UnitLevel } from '../lib/roles';

const UNIT_LEVELS: readonly UnitLevel[] = ['ZONE', 'AREA', 'REGION'] as const;

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
  const managerEmail = (args['manager-email'] ?? '').trim();
  const unit = (args.unit ?? '').trim();
  const levelRaw = (args.level ?? '').trim().toUpperCase();
  const level = levelRaw ? (levelRaw as UnitLevel) : null;

  if (!email) die('Missing --email');
  if (!name) die('Missing --name (used when creating the row)');
  if (!ALL_ROLES.includes(role)) die(`--role must be one of ${ALL_ROLES.join(', ')}`);
  if (level && !UNIT_LEVELS.includes(level))
    die(`--level must be one of ${UNIT_LEVELS.join(', ')}`);

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
    // Optional: resolve the line manager so the approval chain is wired up.
    let managerId: string | null = null;
    if (managerEmail) {
      const manager = await prisma.user.findUnique({
        where: { email: managerEmail },
        select: { id: true, role: true, name: true },
      });
      if (!manager) {
        die(`--manager-email ${managerEmail} has no public.users row. Provision them first.`);
      }
      managerId = manager.id;
      console.log(`  -> manager: ${manager.name} (${manager.role})`);
    }

    const before = await prisma.user.findUnique({ where: { email } });
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        role,
        supabaseUserId: authUser.id,
        name,
        ...(managerId !== null ? { managerId } : {}),
        ...(unit ? { organisationalUnit: unit } : {}),
        ...(level ? { unitLevel: level } : {}),
      },
      create: {
        email,
        name,
        role,
        supabaseUserId: authUser.id,
        managerId,
        organisationalUnit: unit || null,
        unitLevel: level,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        supabaseUserId: true,
        managerId: true,
        organisationalUnit: true,
        unitLevel: true,
      },
    });

    console.log(`\n${before ? 'Updated' : 'Created'} public.users row:`);
    console.log(`  id:                  ${user.id}`);
    console.log(`  email:               ${user.email}`);
    console.log(`  name:                ${user.name}`);
    console.log(`  role:                ${user.role}`);
    console.log(`  supabase_user_id:    ${user.supabaseUserId}`);
    console.log(`  manager_id:          ${user.managerId ?? '(none)'}`);
    console.log(`  organisational_unit: ${user.organisationalUnit ?? '(none)'}`);
    console.log(`  unit_level:          ${user.unitLevel ?? '(none)'}`);
    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nFailed:', err);
  process.exit(1);
});
