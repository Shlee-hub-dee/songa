/**
 * One-off diagnostic. Confirms whether finance@tupande.dev (or another
 * email passed as --email) exists in BOTH supabase auth AND the public.users
 * Prisma table, and whether its role matches FINANCE_MANAGER.
 *
 *   npx tsx scripts/check-finance-user.ts
 *   npx tsx scripts/check-finance-user.ts --email someone@example.com
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeDbUrl } from '../lib/db-url';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const email = arg('email') ?? 'finance@tupande.dev';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!url || !serviceKey || !dbUrl) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL');
    process.exit(2);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeDbUrl(dbUrl) }),
  });

  try {
    // 1) Find in Supabase Auth — listUsers, then filter client-side (admin API
    //    has no email filter on the free tier).
    const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (authErr) throw authErr;
    const authUser = authList.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    console.log(`\n── Supabase Auth (${email}) ──`);
    if (!authUser) {
      console.log('  ❌ NOT FOUND in supabase auth');
    } else {
      console.log(`  ✅ id=${authUser.id}`);
      console.log(`     role(app_metadata)=${(authUser.app_metadata as { role?: string })?.role ?? '(none)'}`);
      console.log(`     created_at=${authUser.created_at}`);
      console.log(`     last_sign_in_at=${authUser.last_sign_in_at ?? '(never)'}`);
    }

    // 2) Find in Prisma users table.
    console.log(`\n── Prisma users (${email}) ──`);
    const prismaUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        supabaseUserId: true,
        managerId: true,
        organisationalUnit: true,
      },
    });
    if (!prismaUser) {
      console.log('  ❌ NOT FOUND in public.users');
    } else {
      console.log(`  ✅ id=${prismaUser.id}`);
      console.log(`     supabaseUserId=${prismaUser.supabaseUserId ?? '(NULL — not linked!)'}`);
      console.log(`     role=${prismaUser.role}`);
      console.log(`     isActive=${prismaUser.isActive}`);
      console.log(`     name=${prismaUser.name}`);
    }

    // 3) Cross-check the link.
    console.log('\n── Verdict ──');
    if (!authUser) {
      console.log('  Need to invite this user via Supabase Auth.');
    } else if (!prismaUser) {
      console.log('  Auth row exists but public.users row missing — login WILL redirect-loop.');
      console.log('  Fix: insert a row in public.users with supabase_user_id=' + authUser.id);
    } else if (prismaUser.supabaseUserId !== authUser.id) {
      console.log('  ⚠️  Prisma row exists but is linked to a different supabase id.');
      console.log(`     prisma.supabaseUserId = ${prismaUser.supabaseUserId}`);
      console.log(`     auth.id               = ${authUser.id}`);
      console.log('  Fix: UPDATE public.users SET supabase_user_id = auth.id WHERE email = ...');
    } else if (prismaUser.role !== 'FINANCE_MANAGER') {
      console.log(`  Role is ${prismaUser.role} — expected FINANCE_MANAGER. Won't loop but won't land on /dashboard/finance.`);
    } else if (!prismaUser.isActive) {
      console.log('  is_active=false — middleware lets them through but the page redirects to /login. Loop risk.');
    } else {
      console.log('  ✅ Everything looks healthy. 429 must be coming from somewhere else.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(2);
});
