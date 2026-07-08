import { Pool, types } from "pg";

// pg convierte DATE, TIMESTAMP y TIMESTAMPTZ a objetos Date de JS por defecto.
// Las columnas DATE del esquema (shifts.date, absences.start_date, etc.) deben
// llegar al cliente como strings "YYYY-MM-DD" para que isSundayOrHoliday y otras
// funciones de cálculo puedan llamar .slice() sin errores.
types.setTypeParser(1082, (val: string) => val);           // DATE → string
types.setTypeParser(1114, (val: string) => val);           // TIMESTAMP → string
// 1115 (_timestamp) y 1182 (_date) son OIDs válidos de Postgres pero el enum
// TypeId de pg-types solo cubre tipos escalares, no sus variantes de array.
types.setTypeParser(1115 as unknown as Parameters<typeof types.setTypeParser>[0], (val: string) => val); // TIMESTAMP[] → string
types.setTypeParser(1182 as unknown as Parameters<typeof types.setTypeParser>[0], (val: string) => val); // DATE[] → string

let _pool: Pool | undefined;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no está configurado en las variables de entorno");
    }
    const sslEnabled = process.env.DB_SSL !== "false";
    _pool = new Pool({
      connectionString,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
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
