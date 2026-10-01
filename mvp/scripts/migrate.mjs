import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL or TEST_DATABASE_URL is required');

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

await client.connect();
try {
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      checksum_sha256 text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const dir = new URL('../db/migrations/', import.meta.url);
  const filenames = readdirSync(dir).filter(name => name.endsWith('.sql')).sort();

  for (const filename of filenames) {
    const sql = readFileSync(join(dir.pathname, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query(
      'select checksum_sha256 from schema_migrations where filename = $1',
      [filename]
    );

    if (applied.rows[0]) {
      if (applied.rows[0].checksum_sha256 !== checksum) {
        throw new Error(`Migration checksum mismatch for ${filename}; never edit an applied migration`);
      }
      console.log(`skip ${filename}`);
      continue;
    }

    console.log(`apply ${filename}`);
    await client.query(sql);
    await client.query(
      'insert into schema_migrations(filename, checksum_sha256) values ($1, $2)',
      [filename, checksum]
    );
  }
} finally {
  await client.end();
}
