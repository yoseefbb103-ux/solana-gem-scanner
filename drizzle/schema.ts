import { boolean, float, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
  executionOrigin: mysqlEnum("executionOrigin", ["manual", "worker"]).notNull().default("manual"),
  candidateCount: int("candidateCount").notNull().default(0),
  visibleCount: int("visibleCount").notNull().default(0),
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
  index("scanner_snapshots_symbol_idx").on(table.symbol),
  index("scanner_snapshots_scan_run_idx").on(table.scanRunId),
  index("scanner_snapshots_fetched_at_idx").on(table.fetchedAt),
]);

export const securityReports = mysqlTable("securityReports", {
  id: int("id").autoincrement().primaryKey(),
  scanRunId: int("scanRunId"),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  pairAddress: varchar("pairAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  source: varchar("source", { length: 80 }).notNull().default("RugCheck"),
  status: mysqlEnum("status", ["passed", "flagged", "unavailable"]).notNull(),
  mintAuthorityOpen: boolean("mintAuthorityOpen").notNull().default(false),
  freezeAuthorityOpen: boolean("freezeAuthorityOpen").notNull().default(false),
  lpLockStatus: mysqlEnum("lpLockStatus", ["locked", "unlocked", "unknown"]).notNull().default("unknown"),
  holderTopPct: float("holderTopPct"),
  holderTop10Pct: float("holderTop10Pct"),
  creatorAddress: varchar("creatorAddress", { length: 80 }),
  ruggedCreator: boolean("ruggedCreator").notNull().default(false),
  rugcheckScore: float("rugcheckScore"),
  symbolConflict: boolean("symbolConflict").notNull().default(false),
  deepScanApplied: boolean("deepScanApplied").notNull().default(false),
  flagsJson: text("flagsJson").notNull(),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
}, (table) => [
  index("security_reports_base_address_idx").on(table.baseAddress),
  index("security_reports_scan_run_idx").on(table.scanRunId),
  index("security_reports_checked_at_idx").on(table.checkedAt),
]);

export const sourceHealthEvents = mysqlTable("sourceHealthEvents", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 80 }).notNull(),
  eventType: mysqlEnum("eventType", ["normal", "slow", "throttled", "error", "recovered"]).notNull(),
  responseStatus: int("responseStatus"),
  latencyMs: int("latencyMs"),
  intervalMs: int("intervalMs").notNull(),
  detail: text("detail"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, (table) => [index("source_health_events_source_date_idx").on(table.source, table.occurredAt)]);

export const scannerSettings = mysqlTable("scannerSettings", {
  id: int("id").autoincrement().primaryKey(),
  scopeKey: varchar("scopeKey", { length: 80 }).notNull().unique(),
  strictSecurity: boolean("strictSecurity").notNull().default(true),
  opportunityAlertThreshold: float("opportunityAlertThreshold").notNull().default(72),
  riskAlertThreshold: float("riskAlertThreshold").notNull().default(28),
  cooldownMinutes: int("cooldownMinutes").notNull().default(120),
  deepScanLimit: int("deepScanLimit").notNull().default(8),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const filterSettings = mysqlTable("filterSettings", {
  id: int("id").autoincrement().primaryKey(),
  scopeKey: varchar("scopeKey", { length: 80 }).notNull().unique(),
  settingsJson: text("settingsJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const watchlist = mysqlTable("watchlist", {
  id: int("id").autoincrement().primaryKey(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  pairAddress: varchar("pairAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("watchlist_base_address_unique").on(table.baseAddress)]);

export const performanceCheckpoints = mysqlTable("performanceCheckpoints", {
  id: int("id").autoincrement().primaryKey(),
  scanRunId: int("scanRunId").notNull(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  opportunityScore: float("opportunityScore").notNull(),
  riskScore: float("riskScore").notNull(),
  baselinePriceUsd: float("baselinePriceUsd").notNull(),
  horizonMinutes: int("horizonMinutes").notNull(),
  dueAt: timestamp("dueAt").notNull(),
  observedAt: timestamp("observedAt"),
  observedPriceUsd: float("observedPriceUsd"),
  returnPct: float("returnPct"),
  outcome: mysqlEnum("outcome", ["pending", "success", "failed", "unavailable"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("performance_due_outcome_idx").on(table.outcome, table.dueAt),
  index("performance_base_address_idx").on(table.baseAddress),
]);

export const alertEvents = mysqlTable("alertEvents", {
  id: int("id").autoincrement().primaryKey(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  opportunityScore: float("opportunityScore").notNull(),
  riskScore: float("riskScore").notNull(),
  channel: mysqlEnum("channel", ["in_app", "telegram"]).notNull(),
  deliveryStatus: mysqlEnum("deliveryStatus", ["queued", "sent", "skipped", "failed"]).notNull(),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("alert_events_address_date_idx").on(table.baseAddress, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
