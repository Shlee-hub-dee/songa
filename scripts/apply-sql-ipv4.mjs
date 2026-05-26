// Variant of apply-sql.mjs that uses the hostname directly (no IPv6 pre-resolution),
// suited for the Supabase pooler endpoint which serves both IPv4 and IPv6 — useful
// when running from a network that doesn't carry IPv6 traffic.
//
//   node scripts/apply-sql-ipv4.mjs prisma/sql/02_tupande_roles_migration.sql
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { normalizeDbUrl } from '../lib/db-url.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env.local.');
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/apply-sql-ipv4.mjs <file1.sql> [file2.sql ...]');
  process.exit(1);
}

const url = new URL(normalizeDbUrl(process.env.DATABASE_URL));

const client = new Client({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
  // Prefer IPv4 for hosts (like the pooler) that resolve to both families.
  lookup: (hostname, _options, callback) => {
    import('node:dns').then(({ promises: dns }) => {
      dns
        .resolve4(hostname)
        .then((addrs) => callback(null, addrs[0], 4))
        .catch((err) => callback(err));
    });
  },
});

try {
  console.log(`→ Connecting to ${url.hostname}:${url.port || 5432} (IPv4) …`);
  await client.connect();
  console.log('✓ Connected');

  for (const file of files) {
    console.log(`\n→ Applying ${file}`);
    const sql = readFileSync(file, 'utf8');
    await client.query(sql);
    console.log(`✓ ${file} applied`);
  }
  console.log('\nDone.');
} catch (err) {
  console.error('\nFailed:', err.message);
  if (err.code) console.error('   code:', err.code);
  if (err.detail) console.error('   detail:', err.detail);
  if (err.hint) console.error('   hint:', err.hint);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
