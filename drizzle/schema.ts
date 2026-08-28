import { boolean, index, integer, pgEnum, pgTable, real, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

const roleEnum = pgEnum("role", ["user", "admin"]);
const scanStatusEnum = pgEnum("scan_status", ["success", "partial", "failed"]);
const executionOriginEnum = pgEnum("execution_origin", ["manual", "worker"]);
const decisionEnum = pgEnum("decision", ["monitor", "caution", "avoid"]);
const lpLockStatusEnum = pgEnum("lp_lock_status", ["locked", "unlocked", "unknown"]);
const sourceHealthEventTypeEnum = pgEnum("source_health_event_type", ["normal", "slow", "throttled", "error", "recovered"]);
const outcomeEnum = pgEnum("outcome", ["pending", "success", "failed", "unavailable"]);
const stageEnum = pgEnum("stage", ["early", "confirmed"]);
const channelEnum = pgEnum("channel", ["in_app", "telegram"]);
const alertTypeEnum = pgEnum("alert_type", ["threshold", "liquidity_pull", "decision_flip", "early_watch", "confirmed_alert"]);
const deliveryStatusEnum = pgEnum("delivery_status", ["queued", "sent", "skipped", "failed"]);
const securityStatusEnum = pgEnum("security_status", ["passed", "flagged", "unavailable"]);
const signalEffectEnum = pgEnum("signal_effect", ["hard_gate", "score_deduction", "informational"]);
const signalAvailabilityEnum = pgEnum("signal_availability", ["available", "unavailable"]);
const signalEvidenceStateEnum = pgEnum("signal_evidence_state", ["safe", "unsafe", "unknown", "unavailable"]);

export const users = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const scanRuns = pgTable("scanRuns", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  source: varchar("source", { length: 80 }).notNull(),
  status: scanStatusEnum("status").notNull(),
  executionOrigin: executionOriginEnum("executionOrigin").notNull().default("manual"),
  candidateCount: integer("candidateCount").notNull().default(0),
  visibleCount: integer("visibleCount").notNull().default(0),
  filterJson: text("filterJson").notNull(),
  errorMessage: text("errorMessage"),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
}, (table) => [index("scan_runs_fetched_at_idx").on(table.fetchedAt)]);

export const scannerSnapshots = pgTable("scannerSnapshots", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  scanRunId: integer("scanRunId").notNull(),
  pairAddress: varchar("pairAddress", { length: 80 }).notNull(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  dexId: varchar("dexId", { length: 64 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  priceUsd: real("priceUsd"),
  liquidityUsd: real("liquidityUsd").notNull().default(0),
  volumeH1: real("volumeH1").notNull().default(0),
  volumeH24: real("volumeH24").notNull().default(0),
  transactionsH1: integer("transactionsH1").notNull().default(0),
  priceChangeM5: real("priceChangeM5").notNull().default(0),
  priceChangeH1: real("priceChangeH1").notNull().default(0),
  pairCreatedAt: timestamp("pairCreatedAt"),
  opportunityScore: real("opportunityScore").notNull(),
  riskScore: real("riskScore").notNull(),
  scoreDelta: real("scoreDelta").notNull().default(0),
  decision: decisionEnum("decision").notNull().default("caution"),
  liquidityDeltaPct: real("liquidityDeltaPct"),
  liquidityPullDetected: boolean("liquidityPullDetected").notNull().default(false),
  liquidityGrowthStable: boolean("liquidityGrowthStable").notNull().default(false),
  liquidDexCount: integer("liquidDexCount").notNull().default(1),
  metadataCompleteness: integer("metadataCompleteness").notNull().default(0),
  jupiterPriceUsd: real("jupiterPriceUsd"),
  priceDivergencePct: real("priceDivergencePct"),
  holderClusterScore: real("holderClusterScore"),
  bundleDetected: boolean("bundleDetected"),
  washTradingScore: real("washTradingScore"),
  fundingSourceOverlap: boolean("fundingSourceOverlap"),
  fundingEvidenceStatus: varchar("fundingEvidenceStatus", { length: 48 }),
  token2022Flags: text("token2022Flags"),
  lpBurnVerified: boolean("lpBurnVerified"),
  factorsJson: text("factorsJson").notNull(),
  warningsJson: text("warningsJson").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
}, (table) => [
  index("scanner_snapshots_base_address_idx").on(table.baseAddress),
  index("scanner_snapshots_symbol_idx").on(table.symbol),
  index("scanner_snapshots_scan_run_idx").on(table.scanRunId),
  index("scanner_snapshots_fetched_at_idx").on(table.fetchedAt),
]);

export const signalObservations = pgTable("signalObservations", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  scanRunId: integer("scanRunId"),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  pairAddress: varchar("pairAddress", { length: 80 }),
  stage: stageEnum("stage"),
  signalKey: varchar("signalKey", { length: 96 }).notNull(),
  reasonCode: varchar("reasonCode", { length: 120 }).notNull(),
  effect: signalEffectEnum("effect").notNull(),
  availability: signalAvailabilityEnum("availability").notNull(),
  evidenceState: signalEvidenceStateEnum("evidenceState").notNull(),
  value: real("value"),
  valueJson: text("valueJson"),
  source: varchar("source", { length: 96 }).notNull(),
  observedAt: timestamp("observedAt").notNull(),
  requestCost: integer("requestCost").notNull().default(0),
}, (table) => [
  index("signal_observations_token_time_idx").on(table.baseAddress, table.observedAt),
  index("signal_observations_key_time_idx").on(table.signalKey, table.observedAt),
  index("signal_observations_scan_run_idx").on(table.scanRunId),
]);

export const securityReports = pgTable("securityReports", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  scanRunId: integer("scanRunId"),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  pairAddress: varchar("pairAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  source: varchar("source", { length: 80 }).notNull().default("RugCheck"),
  status: securityStatusEnum("status").notNull(),
  mintAuthorityOpen: boolean("mintAuthorityOpen").notNull().default(false),
  freezeAuthorityOpen: boolean("freezeAuthorityOpen").notNull().default(false),
  lpLockStatus: lpLockStatusEnum("lpLockStatus").notNull().default("unknown"),
  holderTopPct: real("holderTopPct"),
  holderTop10Pct: real("holderTop10Pct"),
  creatorAddress: varchar("creatorAddress", { length: 80 }),
  ruggedCreator: boolean("ruggedCreator").notNull().default(false),
  knownRuggedDeployer: boolean("knownRuggedDeployer").notNull().default(false),
  sprayCount24h: integer("sprayCount24h").notNull().default(0),
  rugcheckScore: real("rugcheckScore"),
  symbolConflict: boolean("symbolConflict").notNull().default(false),
  deepScanApplied: boolean("deepScanApplied").notNull().default(false),
  holderClusterScore: real("holderClusterScore"),
  bundleDetected: boolean("bundleDetected"),
  washTradingScore: real("washTradingScore"),
  fundingSourceOverlap: boolean("fundingSourceOverlap"),
  fundingEvidenceStatus: varchar("fundingEvidenceStatus", { length: 48 }),
  token2022Flags: text("token2022Flags"),
  lpBurnVerified: boolean("lpBurnVerified"),
  flagsJson: text("flagsJson").notNull(),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
}, (table) => [
  index("security_reports_base_address_idx").on(table.baseAddress),
  index("security_reports_scan_run_idx").on(table.scanRunId),
  index("security_reports_checked_at_idx").on(table.checkedAt),
]);

export const knownRuggedDeployers = pgTable("knownRuggedDeployers", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  creatorAddress: varchar("creatorAddress", { length: 80 }).notNull().unique(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  hitCount: integer("hitCount").notNull().default(1),
  source: varchar("source", { length: 80 }).notNull().default("RugCheck"),
}, (table) => [index("known_rugged_deployers_last_seen_idx").on(table.lastSeenAt)]);

export const sourceHealthEvents = pgTable("sourceHealthEvents", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  source: varchar("source", { length: 80 }).notNull(),
  eventType: sourceHealthEventTypeEnum("eventType").notNull(),
  responseStatus: integer("responseStatus"),
  latencyMs: integer("latencyMs"),
  intervalMs: integer("intervalMs").notNull(),
  detail: text("detail"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, (table) => [index("source_health_events_source_date_idx").on(table.source, table.occurredAt)]);

export const scannerRunLocks = pgTable("scannerRunLocks", {
  scopeKey: varchar("scopeKey", { length: 64 }).primaryKey(),
  lockToken: varchar("lockToken", { length: 80 }).notNull(),
  lockedAt: timestamp("lockedAt").defaultNow().notNull(),
}, (table) => [index("scanner_run_locks_locked_at_idx").on(table.lockedAt)]);

export const scannerSettings = pgTable("scannerSettings", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  scopeKey: varchar("scopeKey", { length: 80 }).notNull().unique(),
  strictSecurity: boolean("strictSecurity").notNull().default(true),
  opportunityAlertThreshold: real("opportunityAlertThreshold").notNull().default(72),
  riskAlertThreshold: real("riskAlertThreshold").notNull().default(28),
  cooldownMinutes: integer("cooldownMinutes").notNull().default(120),
  deepScanLimit: integer("deepScanLimit").notNull().default(8),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const filterSettings = pgTable("filterSettings", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  scopeKey: varchar("scopeKey", { length: 80 }).notNull().unique(),
  settingsJson: text("settingsJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const watchlist = pgTable("watchlist", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  pairAddress: varchar("pairAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("watchlist_base_address_unique").on(table.baseAddress)]);

export const performanceCheckpoints = pgTable("performanceCheckpoints", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  scanRunId: integer("scanRunId").notNull(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  opportunityScore: real("opportunityScore").notNull(),
  riskScore: real("riskScore").notNull(),
  baselinePriceUsd: real("baselinePriceUsd").notNull(),
  horizonMinutes: integer("horizonMinutes").notNull(),
  dueAt: timestamp("dueAt").notNull(),
  observedAt: timestamp("observedAt"),
  observedPriceUsd: real("observedPriceUsd"),
  returnPct: real("returnPct"),
  outcome: outcomeEnum("outcome").notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("performance_due_outcome_idx").on(table.outcome, table.dueAt),
  index("performance_base_address_idx").on(table.baseAddress),
]);

export const earlyTokenWatches = pgTable("earlyTokenWatches", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull().unique(),
  pairAddress: varchar("pairAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  discoverySourcesJson: text("discoverySourcesJson").notNull(),
  firstLiquidityUsd: real("firstLiquidityUsd").notNull().default(0),
  pairCreatedAt: timestamp("pairCreatedAt"),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  stage: stageEnum("stage").notNull().default("early"),
  confirmedAt: timestamp("confirmedAt"),
  confirmationScanRunId: integer("confirmationScanRunId"),
  earlyAlerted: boolean("earlyAlerted").notNull().default(false),
  confirmedAlerted: boolean("confirmedAlerted").notNull().default(false),
}, (table) => [
  index("early_watches_stage_seen_idx").on(table.stage, table.firstSeenAt),
  index("early_watches_pair_idx").on(table.pairAddress),
]);

export const alertEvents = pgTable("alertEvents", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  baseAddress: varchar("baseAddress", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  opportunityScore: real("opportunityScore").notNull(),
  riskScore: real("riskScore").notNull(),
  channel: channelEnum("channel").notNull(),
  alertType: alertTypeEnum("alertType").notNull().default("threshold"),
  deliveryStatus: deliveryStatusEnum("deliveryStatus").notNull(),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("alert_events_address_date_idx").on(table.baseAddress, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
