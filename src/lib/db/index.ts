import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, {
  max: 5,
  idle_timeout: 60,
  connect_timeout: 30,
  ssl: 'require',
});

export const db = drizzle(client, { schema });
