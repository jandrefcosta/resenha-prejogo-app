// Runs pending Drizzle migrations from ./drizzle against DATABASE_URL.
// .mjs on purpose: uses only runtime deps (postgres, drizzle-orm) so it works
// in the production image without tsx/drizzle-kit (devDeps may be pruned).
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL not set');
  process.exit(1);
}

// max: 1 — single dedicated connection, closed at the end. The migrator runs
// each migration in a transaction and records them in __drizzle_migrations.
const client = postgres(url, { max: 1, ssl: 'require' });

try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('[migrate] OK');
} catch (err) {
  console.error('[migrate] FAILED:', err);
  process.exitCode = 1;
} finally {
  await client.end();
}
