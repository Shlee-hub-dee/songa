/**
 * Print a sample REGIONAL_MANAGER → AREA_COORDINATOR → ZONE_SUPERVISOR chain
 * from the seed data. Useful when you want a triplet of existing accounts to
 * invite into Supabase Auth for end-to-end role testing.
 *
 *   npx tsx scripts/find-approval-chain.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeDbUrl } from '../lib/db-url';

async function main() {
  const dbUrl = process.env.DATABASE_URL!;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeDbUrl(dbUrl) }),
  });

  try {
    // Pick the first RM that has at least one AC under it whose under has at
    // least one ZS. We walk top-down so the chain is guaranteed to be valid.
    const rms = await prisma.user.findMany({
      where: { role: 'REGIONAL_MANAGER', isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        organisationalUnit: true,
        supabaseUserId: true,
        reports: {
          where: { role: 'AREA_COORDINATOR', isActive: true },
          select: {
            id: true,
            email: true,
            name: true,
            organisationalUnit: true,
            supabaseUserId: true,
            reports: {
              where: { role: 'ZONE_SUPERVISOR', isActive: true },
              select: {
                id: true,
                email: true,
                name: true,
                organisationalUnit: true,
                supabaseUserId: true,
              },
            },
          },
        },
      },
    });

    console.log('Candidate chains (RM → AC → ZS):\n');
    let printed = 0;
    for (const rm of rms) {
      for (const ac of rm.reports) {
        for (const zs of ac.reports) {
          printed++;
          console.log(`Chain #${printed}`);
          console.log(
            `  RM: ${rm.name.padEnd(24)} ${rm.email.padEnd(36)} unit=${rm.organisationalUnit ?? '—'}  linked=${rm.supabaseUserId ? 'yes' : 'no'}`,
          );
          console.log(
            `  AC: ${ac.name.padEnd(24)} ${ac.email.padEnd(36)} unit=${ac.organisationalUnit ?? '—'}  linked=${ac.supabaseUserId ? 'yes' : 'no'}`,
          );
          console.log(
            `  ZS: ${zs.name.padEnd(24)} ${zs.email.padEnd(36)} unit=${zs.organisationalUnit ?? '—'}  linked=${zs.supabaseUserId ? 'yes' : 'no'}`,
          );
          console.log('');
          if (printed >= 3) break;
        }
        if (printed >= 3) break;
      }
      if (printed >= 3) break;
    }
    if (printed === 0) {
      console.log('  (none — no RM has an AC with a ZS under them)');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
