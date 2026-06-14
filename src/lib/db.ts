import { Pool } from "pg";

let _pool: Pool | undefined;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no está configurado en las variables de entorno");
    }
    _pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return _pool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queryOne<T = any>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params?: unknown[]): Promise<void> {
  const pool = getPool();
  await pool.query(sql, params);
}
