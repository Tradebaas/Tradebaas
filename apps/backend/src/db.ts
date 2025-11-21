import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in environment');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function testDbConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
