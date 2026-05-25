// Apply prisma/sql/*.sql against the Supabase database using the pg driver.
// Used in place of psql (not installed on Windows here) and works around the
// fact that Supabase's direct-DB endpoints are IPv6-only on some regions —
// we set `family: 0` so Node tries both protocol families.
// .env.local first (matches Next.js precedence); dotenv doesn't overwrite
// existing keys, so loading .env.local before .env gives us "local wins".
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { readFileSync } from 'node:fs';
import { promises as dns } from 'node:dns';
import { Client } from 'pg';
import { normalizeDbUrl } from '../lib/db-url.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env.local.');
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/apply-sql.mjs <file1.sql> [file2.sql ...]');
  process.exit(1);
}

const url = new URL(normalizeDbUrl(process.env.DATABASE_URL));

// Supabase direct-DB endpoints are IPv6-only on some regions; Node's default
// resolver prefers A records and gives up if none exist. Resolve AAAA up-front
// and feed the literal address into pg.
let host = url.hostname;
try {
  const records = await dns.resolve6(url.hostname);
  if (records.length > 0) {
    host = records[0];
    console.log(`→ Resolved ${url.hostname} → ${host} (IPv6)`);
  }
} catch {
  /* fall through with the original hostname */
}

const client = new Client({
  host,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  // Supabase requires SSL; we don't validate the cert because the address we
  // dial is a literal IPv6 string, not the hostname in the leaf cert.
  ssl: { rejectUnauthorized: false },
});

try {
  console.log(`→ Connecting to ${url.hostname}:${url.port || 5432} …`);
  await client.connect();
  console.log('✓ Connected');

  for (const file of files) {
    console.log(`\n→ Applying ${file}`);
    const sql = readFileSync(file, 'utf8');
    await client.query(sql);
    console.log(`✓ ${file} applied`);
  }
  console.log('\n✅ Done.');
} catch (err) {
  console.error('\n❌ Failed:', err.message);
  if (err.code) console.error('   code:', err.code);
  if (err.detail) console.error('   detail:', err.detail);
  if (err.hint) console.error('   hint:', err.hint);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
