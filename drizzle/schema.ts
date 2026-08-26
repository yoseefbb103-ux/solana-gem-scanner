import { float, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const scanRuns = mysqlTable("scanRuns", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["success", "partial", "failed"]).notNull(),
  candidateCount: int("candidateCount").notNull().default(0),
  filterJson: text("filterJson").notNull(),
  errorMessage: text("errorMessage"),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
}, (table) => [index("scan_runs_fetched_at_idx").on(table.fetchedAt)]);

export const scannerSnapshots = mysqlTable("scannerSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  scanRunId: int("scanRunId").notNull(),
  pairAddress: varchar("pairAddress", { length: 80 }).notNull(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  dexId: varchar("dexId", { length: 64 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  priceUsd: float("priceUsd"),
  liquidityUsd: float("liquidityUsd").notNull().default(0),
  volumeH1: float("volumeH1").notNull().default(0),
  volumeH24: float("volumeH24").notNull().default(0),
  transactionsH1: int("transactionsH1").notNull().default(0),
  priceChangeM5: float("priceChangeM5").notNull().default(0),
  priceChangeH1: float("priceChangeH1").notNull().default(0),
  pairCreatedAt: timestamp("pairCreatedAt"),
  opportunityScore: float("opportunityScore").notNull(),
  riskScore: float("riskScore").notNull(),
  scoreDelta: float("scoreDelta").notNull().default(0),
  factorsJson: text("factorsJson").notNull(),
  warningsJson: text("warningsJson").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
}, (table) => [
  index("scanner_snapshots_base_address_idx").on(table.baseAddress),
  index("scanner_snapshots_scan_run_idx").on(table.scanRunId),
  index("scanner_snapshots_fetched_at_idx").on(table.fetchedAt),
]);

export const filterSettings = mysqlTable("filterSettings", {
  id: int("id").autoincrement().primaryKey(),
  scopeKey: varchar("scopeKey", { length: 80 }).notNull().unique(),
  settingsJson: text("settingsJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
