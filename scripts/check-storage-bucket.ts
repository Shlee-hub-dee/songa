/**
 * Verify (and optionally create) the mpesa-screenshots Storage bucket.
 *
 *   npx tsx scripts/check-storage-bucket.ts          # probe only
 *   npx tsx scripts/check-storage-bucket.ts --create # create if missing (private)
 *
 * Background: the upload-url route calls createSignedUploadUrl against
 * the bucket. If the bucket doesn't exist, Supabase returns
 * "the related resource does not exist" which surfaces to the user as a
 * generic upload failure.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'mpesa-screenshots';

async function main() {
  const create = process.argv.includes('--create');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(2);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Listing buckets at ${url} ...`);
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('listBuckets failed:', listErr.message);
    process.exit(2);
  }
  console.log('Buckets present:', buckets.map((b) => b.name).join(', ') || '(none)');

  const existing = buckets.find((b) => b.name === BUCKET);
  if (existing) {
    console.log(`\nBucket ${BUCKET} exists. public=${existing.public}, fileSizeLimit=${existing.file_size_limit ?? '(none)'}`);
    // Probe createSignedUploadUrl too — that's what the upload route actually does.
    const probe = `__probe/${Date.now()}.jpg`;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(probe);
    if (error) {
      console.log(`\n⚠️  createSignedUploadUrl failed: ${error.message}`);
    } else {
      console.log(`\ncreateSignedUploadUrl OK (path=${data.path})`);
    }
    return;
  }

  if (!create) {
    console.log(`\nBucket ${BUCKET} NOT FOUND. Re-run with --create to create it (private).`);
    process.exit(1);
  }

  console.log(`\nCreating private bucket ${BUCKET} ...`);
  const { data, error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 1024 * 1024, // 1 MB — well above the 600KB cap the API enforces
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error) {
    console.error('createBucket failed:', error.message);
    process.exit(2);
  }
  console.log('Created:', data);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
