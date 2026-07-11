import { Pool } from "pg";

/**
 * Shared PostgreSQL connection pool.
 *
 * In development, Next.js hot-reloads modules on every change, which would
 * otherwise create a new pool (and leak connections) on each reload. We cache
 * the pool on `globalThis` to reuse a single instance.
 */
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  console.log(process.env.DATABASE_URL);

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Azure PostgreSQL credentials."
    );
  }

  return new Pool({
    connectionString,
    // Azure PostgreSQL requires TLS. `sslmode=require` in the connection string
    // enables it; this ensures the driver negotiates SSL even if the mode flag
    // is omitted. Azure presents a trusted cert, so verification stays on.
    ssl: { rejectUnauthorized: true },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool: Pool = global.__pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

/**
 * Run a parameterized query against the pool.
 * Always pass user input via `params` ($1, $2, …) — never string-interpolate.
 */
export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}
