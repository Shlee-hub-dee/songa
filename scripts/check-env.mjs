import { readFileSync } from 'node:fs';
for (const f of ['.env', '.env.local']) {
  console.log(`\n=== ${f} ===`);
  const text = readFileSync(f, 'utf8');
  const lines = text.split(/\r?\n/);
  // Find DATABASE_URL block (might span multiple lines if pasted weirdly)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('DATABASE_URL')) {
      console.log(`line ${i + 1}:`, JSON.stringify(lines[i]));
      // Also dump the next 2 lines in case the URL wrapped
      if (lines[i + 1] !== undefined) console.log(`line ${i + 2}:`, JSON.stringify(lines[i + 1]));
      if (lines[i + 2] !== undefined) console.log(`line ${i + 3}:`, JSON.stringify(lines[i + 2]));
    }
  }
}
