import { Pool } from "pg";

/**
 * READ-ONLY connection to the Risansi Market Intell database.
 *
 * This app must NEVER write to Market Intell — it is owned by another system.
 * Three layers enforce that:
 *   1. A separate pool, so no app code can reach it through the normal `query`
 *      helper in lib/db.ts.
 *   2. Every new connection sets `default_transaction_read_only = on`, so
 *      Postgres itself rejects any INSERT/UPDATE/DELETE/DDL on this session —
 *      a bug or an injected statement still cannot mutate anything.
 *   3. Only the narrow, parameterised readers below are exported.
 */
declare global {
  // eslint-disable-next-line no-var
  var __marketIntellPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL_EXT;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_EXT is not set — needed to read the Market Intell client list."
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    // Applied by the server at connection startup — before any statement can
    // run — so every session is physically incapable of writing. Postgres
    // rejects INSERT/UPDATE/DELETE/DDL with "cannot execute ... in a read-only
    // transaction". Set here rather than via a `connect` handler so there is
    // no window where a query could run before the guard takes effect.
    options: "-c default_transaction_read_only=on",
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  pool.on("error", (err) => {
    console.error("market-intell idle client error:", err.message);
  });

  return pool;
}

function getPool(): Pool {
  if (process.env.NODE_ENV === "production") {
    return (globalThis.__marketIntellPool ??= createPool());
  }
  return (globalThis.__marketIntellPool ??= createPool());
}

/** One client as shown in the order-creation search results. */
export type MarketIntellClient = {
  code: string;
  legal_name: string | null;
  market_type: string | null;
  client_type: string | null;
  industry: string | null;
};

const SELECT_COLUMNS =
  "code, legal_name, market_type, client_type, industry";

/**
 * Search live clients by code or legal name. Prefix matches rank first, then
 * "contains" matches. Soft-deleted rows are excluded.
 */
export async function searchClients(
  term: string,
  limit = 20
): Promise<MarketIntellClient[]> {
  const q = term.trim();
  if (q.length < 2) return [];

  const contains = `%${q}%`;
  const prefix = `${q}%`;

  const result = await getPool().query<MarketIntellClient>(
    `SELECT ${SELECT_COLUMNS}
       FROM public.clients
      WHERE deleted_at IS NULL
        AND code IS NOT NULL
        AND (code ILIKE $1 OR legal_name ILIKE $1)
      ORDER BY
        CASE
          WHEN code ILIKE $2 THEN 0
          WHEN legal_name ILIKE $2 THEN 1
          ELSE 2
        END,
        legal_name NULLS LAST,
        code
      LIMIT $3`,
    [contains, prefix, limit]
  );
  return result.rows;
}

/** Fetch one client by its exact code — used when creating the order, so the
 *  stored details always come from Market Intell, never from the browser. */
export async function getClientByCode(
  code: string
): Promise<MarketIntellClient | null> {
  const c = code.trim();
  if (!c) return null;
  const result = await getPool().query<MarketIntellClient>(
    `SELECT ${SELECT_COLUMNS}
       FROM public.clients
      WHERE deleted_at IS NULL AND code = $1
      LIMIT 1`,
    [c]
  );
  return result.rows[0] ?? null;
}
