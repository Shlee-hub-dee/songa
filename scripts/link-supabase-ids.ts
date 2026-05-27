/**
 * Backfill public.users.supabase_user_id from supabase auth.users by email.
 *
 *   npx tsx scripts/link-supabase-ids.ts            # dry run, report only
 *   npx tsx scripts/link-supabase-ids.ts --apply    # actually update
 *
 * A NULL link makes the user redirect-loop on login because the dashboard
 * looks them up by supabase_user_id and finds nothing. This is a one-shot
 * repair — set-user-role.ts already writes the link for any new users.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeDbUrl } from '../lib/db-url';

async function main() {
  const apply = process.argv.includes('--apply');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const dbUrl = process.env.DATABASE_URL!;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeDbUrl(dbUrl) }),
  });

  try {
    const { data: authList, error } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw error;

    const authByEmail = new Map<string, string>();
    for (const u of authList.users) {
      if (u.email) authByEmail.set(u.email.toLowerCase(), u.id);
    }

    const unlinked = await prisma.user.findMany({
      where: { supabaseUserId: null },
      select: { id: true, email: true, role: true, name: true },
    });

    console.log(`Unlinked Prisma rows: ${unlinked.length}`);
    let fixable = 0;
    let unfixable = 0;
    for (const u of unlinked) {
      const authId = authByEmail.get(u.email.toLowerCase());
      if (authId) {
        console.log(`  → ${u.email} (${u.role}) → ${authId}`);
        fixable++;
        if (apply) {
          await prisma.user.update({
            where: { id: u.id },
            data: { supabaseUserId: authId },
          });
        }
      } else {
        console.log(`  ✗ ${u.email} (${u.role}) — no matching supabase auth user`);
        unfixable++;
      }
    }

    console.log('');
    if (apply) {
      console.log(`Linked ${fixable}. Skipped ${unfixable} (no auth row).`);
    } else {
      console.log(`Would link ${fixable}. ${unfixable} have no auth row.`);
      console.log('Re-run with --apply to actually update.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(2);
});
