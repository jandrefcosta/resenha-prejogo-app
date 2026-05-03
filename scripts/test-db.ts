import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }

console.log('Conectando em:', url!.replace(/:([^:@]+)@/, ':***@'));

const sql = postgres(url!, { ssl: 'require', connect_timeout: 10 });

async function main() {
  try {
    const r = await sql`SELECT version()`;
    console.log('✓ Conexão OK:', r[0].version);
  } catch (e) {
    console.error('✗ Erro:', (e as Error).message);
  } finally {
    await sql.end();
  }
}

main();
