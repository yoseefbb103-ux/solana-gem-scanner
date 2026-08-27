import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

function poolOptions(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode");
    const localHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
    if (localHost && sslMode !== "verify-ca" && sslMode !== "verify-full") {
      parsed.searchParams.delete("sslmode");
      return { connectionString: parsed.toString(), ssl: undefined };
    }
    const useSsl = sslMode !== "disable" && (sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full" || parsed.hostname.endsWith("render.com"));
    return { connectionString: databaseUrl, ssl: useSsl ? { rejectUnauthorized: false } : undefined };
  } catch {
    return { connectionString: databaseUrl, ssl: databaseUrl.includes("render.com") ? { rejectUnauthorized: false } : undefined };
  }
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL || ENV.databaseUrl;
    if (!databaseUrl) {
      console.warn("[Database] DATABASE_URL is not configured; persistence is unavailable.");
      return null;
    }
    try {
      _pool = new Pool(poolOptions(databaseUrl));
      await _pool.query("SELECT 1");
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      await _pool?.end();
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
