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
      max: 10,
      idleTimeoutMillis: 30_000,
      // Sin esto, un intento de conexión que no consigue cliente (BD caída o
      // saturada) se queda colgado indefinidamente en vez de fallar rápido —
      // el navegador ve eso como "Failed to fetch" tras su propio timeout.
      connectionTimeoutMillis: 10_000,
    });
    // CRÍTICO: sin este listener, un error en un cliente INACTIVO del pool
    // (ej. Postgres cierra la conexión por detrás) se propaga como excepción
    // no capturada de Node y tumba TODO el proceso — la causa más probable
    // del "Failed to fetch" intermitente reportado (el contenedor se
    // reinicia a mitad de otras peticiones en curso).
    _pool.on("error", (err) => {
      console.error("[pg pool] error en cliente inactivo:", err);
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

export interface TxClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryOne<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

/**
 * Ejecuta varias escrituras dentro de una sola transacción (BEGIN/COMMIT/ROLLBACK)
 * sobre la MISMA conexión — usar para cualquier operación "lógicamente atómica"
 * (más de un INSERT/UPDATE que deban tener éxito o fallar juntos). Sin esto,
 * un fallo a mitad de camino deja la base de datos en un estado parcial.
 */
export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  const tx: TxClient = {
    query: async (sql, params) => (await client.query(sql, params)).rows,
    queryOne: async (sql, params) => (await client.query(sql, params)).rows[0] ?? null,
    execute: async (sql, params) => { await client.query(sql, params); },
  };
  try {
    await client.query("BEGIN");
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
