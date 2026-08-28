import { readFile } from "node:fs/promises";
import { Client } from "pg";

const maxAttempts = Number(process.env.DB_PUSH_MAX_ATTEMPTS ?? 12);
const retryDelayMs = Number(process.env.DB_PUSH_RETRY_DELAY_MS ?? 5000);
const migrationUrls = [
  new URL("../drizzle/0000_fuzzy_robbie_robertson.sql", import.meta.url),
  new URL("../drizzle/0001_young_warstar.sql", import.meta.url),
];

if (!process.env.DATABASE_URL) {
  console.error("[DB Bootstrap] DATABASE_URL is required before starting the service.");
  process.exit(1);
}

function connectionOptions() {
  const raw = process.env.DATABASE_URL;
  const parsed = new URL(raw);
  const sslMode = parsed.searchParams.get("sslmode");
  const localHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
  if (localHost && sslMode !== "verify-ca" && sslMode !== "verify-full") {
    parsed.searchParams.delete("sslmode");
    return { connectionString: parsed.toString(), ssl: undefined };
  }
  const useSsl = sslMode !== "disable" && (sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full" || parsed.hostname.endsWith("render.com"));
  return { connectionString: raw, ssl: useSsl ? { rejectUnauthorized: false } : undefined };
}

function makeIdempotent(statement) {
  const sql = statement.trim();
  if (!sql) return null;

  const typeMatch = sql.match(/^CREATE TYPE\s+("[^"]+")\s+AS ENUM\s+([\s\S]+);?$/i);
  if (typeMatch) {
    return `DO $$ BEGIN CREATE TYPE ${typeMatch[1]} AS ENUM ${typeMatch[2].replace(/;\s*$/, "")}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
  }
  if (/^CREATE UNIQUE INDEX\s+/i.test(sql)) {
    return sql.replace(/^CREATE UNIQUE INDEX\s+/i, "CREATE UNIQUE INDEX IF NOT EXISTS ");
  }
  if (/^CREATE INDEX\s+/i.test(sql)) {
    return sql.replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ");
  }
  if (/^CREATE TABLE\s+/i.test(sql)) {
    return sql.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
  }
  return sql;
}

async function applyMigrations() {
  const statements = [];
  for (const migrationUrl of migrationUrls) {
    const migration = await readFile(migrationUrl, "utf8");
    statements.push(...migration
      .split(/-->\s*statement-breakpoint/g)
      .map(makeIdempotent)
      .filter(Boolean));
  }
  const client = new Client(connectionOptions());
  await client.connect();
  try {
    await client.query("SET search_path TO public");
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    console.log(`[DB Bootstrap] Applying deterministic PostgreSQL migrations (attempt ${attempt}/${maxAttempts})...`);
    await applyMigrations();
    console.log("[DB Bootstrap] PostgreSQL schema is ready.");
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[DB Bootstrap] Attempt ${attempt} failed: ${message}`);
    if (attempt === maxAttempts) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

console.error("[DB Bootstrap] Could not apply the PostgreSQL schema; service startup aborted.");
process.exit(1);
