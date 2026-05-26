/**
 * Sanity check before destructive operations.
 *
 *   npx tsx scripts/check-schema.ts
 *
 * Reads the `Role` enum values straight from pg_enum so we can tell whether
 * the Tupande migration (prisma/sql/02_tupande_roles_migration.sql) has been
 * applied. Exits 0 if the new enum is in place, 1 otherwise.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeDbUrl } from '../lib/db-url';

const NEW_VALUES = new Set([
  'TUPANDE_AGENT',
  'ZONE_SUPERVISOR',
  'AREA_COORDINATOR',
  'REGIONAL_MANAGER',
  'FINANCE_MANAGER',
  'ADMIN',
]);
const OLD_VALUES = new Set(['FIELD_OFFICER', 'MANAGER', 'FINANCE', 'ADMIN']);

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(2);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeDbUrl(dbUrl) }),
  });

  try {
    const enumRows = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(`
      SELECT pg_enum.enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'Role'
      ORDER BY pg_enum.enumsortorder
    `);
    const present = new Set(enumRows.map((r) => r.enumlabel));
    console.log('Role enum values currently in DB:', Array.from(present).join(', '));

    const colRows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN ('organisational_unit', 'unit_level')
    `);
    const cols = new Set(colRows.map((r) => r.column_name));
    console.log('New columns present:', Array.from(cols).join(', ') || '(none)');

    const userCount = await prisma.user.count();
    console.log(`public.users row count: ${userCount}`);

    const hasNew = Array.from(NEW_VALUES).every((v) => present.has(v));
    const hasOld = Array.from(OLD_VALUES).some((v) => present.has(v) && !NEW_VALUES.has(v));
    const colsOk = cols.has('organisational_unit') && cols.has('unit_level');

    console.log('');
    if (hasNew && !hasOld && colsOk) {
      console.log('Schema OK — Tupande migration is in place.');
      process.exit(0);
    } else {
      console.log('Schema NOT migrated yet.');
      if (!hasNew)
        console.log('  - missing new Role values; run prisma/sql/02_tupande_roles_migration.sql');
      if (hasOld) console.log('  - old Role values still present');
      if (!colsOk) console.log('  - missing organisational_unit / unit_level columns');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(2);
});
