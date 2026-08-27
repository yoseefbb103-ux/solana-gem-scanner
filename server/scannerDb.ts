import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alertEvents, filterSettings, knownRuggedDeployers, performanceCheckpoints, scannerRunLocks, scannerSettings, scannerSnapshots, scanRuns, securityReports, sourceHealthEvents, watchlist } from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_FILTERS, DEFAULT_SCANNER_SETTINGS, type ScanFilters, type ScannerSettings, type ScoredCandidate, type SecurityReport, type SourceTelemetry } from "./scanner/types";

type StoreScanInput = {
  source: string;
  status: "success" | "partial" | "failed";
  executionOrigin: "manual" | "worker";
  filters: ScanFilters;
  candidates: ScoredCandidate[];
  visibleCount: number;
  fetchedAt: Date;
  errorMessage?: string;
};

type HealthEvent = { source: string; eventType: "normal" | "slow" | "throttled" | "error" | "recovered"; responseStatus: number | null; latencyMs: number; intervalMs: number; detail?: string };

const parseFilters = (value?: string | null): ScanFilters => {
  try { return { ...DEFAULT_FILTERS, ...(value ? JSON.parse(value) : {}) }; } catch { return DEFAULT_FILTERS; }
};
const parseJsonArray = (value: string) => { try { return JSON.parse(value) as string[]; } catch { return [] as string[]; } };
const num = (value: number | null | undefined) => value === null || value === undefined ? null : Number(value);
const toDateMs = (value: Date | null | undefined) => value?.getTime() ?? null;
const SCANNER_LOCK_SCOPE = "global-scanner";
const SCANNER_LOCK_TTL_MS = 5 * 60_000;

export const SCANNER_LOCKED_MESSAGE = "يوجد فحص نشط بالفعل؛ أعد المحاولة بعد اكتماله.";

export async function acquireScannerRunLock(lockToken: string) {
  const db = await getDb();
  if (!db) throw new Error("تعذر تأمين الفحص لأن قاعدة البيانات غير متاحة.");
  const lockedAt = new Date();
  const expiresAt = new Date(lockedAt.getTime() - SCANNER_LOCK_TTL_MS);
  await db.insert(scannerRunLocks).values({ scopeKey: SCANNER_LOCK_SCOPE, lockToken, lockedAt }).onDuplicateKeyUpdate({
    set: {
      lockToken: sql`IF(${scannerRunLocks.lockedAt} < ${expiresAt}, VALUES(${sql.raw("`lockToken`")}), ${scannerRunLocks.lockToken})`,
      lockedAt: sql`IF(${scannerRunLocks.lockedAt} < ${expiresAt}, VALUES(${sql.raw("`lockedAt`")}), ${scannerRunLocks.lockedAt})`,
    },
  });
  const [activeLock] = await db.select().from(scannerRunLocks).where(eq(scannerRunLocks.scopeKey, SCANNER_LOCK_SCOPE)).limit(1);
  if (!activeLock || activeLock.lockToken !== lockToken) throw new Error(SCANNER_LOCKED_MESSAGE);
}

export async function releaseScannerRunLock(lockToken: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(scannerRunLocks).where(and(eq(scannerRunLocks.scopeKey, SCANNER_LOCK_SCOPE), eq(scannerRunLocks.lockToken, lockToken)));
}

function mapSecurity(row: typeof securityReports.$inferSelect): SecurityReport {
  return {
    baseAddress: row.baseAddress, pairAddress: row.pairAddress, symbol: row.symbol, source: row.source, status: row.status,
    mintAuthorityOpen: row.mintAuthorityOpen, freezeAuthorityOpen: row.freezeAuthorityOpen, lpLockStatus: row.lpLockStatus,
    holderTopPct: num(row.holderTopPct), holderTop10Pct: num(row.holderTop10Pct), creatorAddress: row.creatorAddress,
    ruggedCreator: row.ruggedCreator, knownRuggedDeployer: row.knownRuggedDeployer, sprayCount24h: row.sprayCount24h, rugcheckScore: num(row.rugcheckScore), symbolConflict: row.symbolConflict,
    deepScanApplied: row.deepScanApplied, holderClusterScore: num(row.holderClusterScore), bundleDetected: row.bundleDetected, washTradingScore: num(row.washTradingScore),
    fundingSourceOverlap: row.fundingSourceOverlap, token2022Flags: parseJsonArray(row.token2022Flags ?? "[]"), lpBurnVerified: row.lpBurnVerified,
    flags: parseJsonArray(row.flagsJson), checkedAt: row.checkedAt.getTime(),
  };
}

export async function getPreviousScores() {
  const db = await getDb();
  const scores = new Map<string, number>();
  if (!db) return scores;
  const rows = await db.select({ baseAddress: scannerSnapshots.baseAddress, opportunityScore: scannerSnapshots.opportunityScore }).from(scannerSnapshots).orderBy(desc(scannerSnapshots.fetchedAt)).limit(500);
  for (const row of rows) if (!scores.has(row.baseAddress)) scores.set(row.baseAddress, Number(row.opportunityScore));
  return scores;
}

export async function getKnownSymbolAddresses() {
  const db = await getDb();
  const symbols = new Map<string, Set<string>>();
  if (!db) return symbols;
  const rows = await db.select({ symbol: scannerSnapshots.symbol, baseAddress: scannerSnapshots.baseAddress }).from(scannerSnapshots).orderBy(desc(scannerSnapshots.fetchedAt)).limit(2000);
  for (const row of rows) {
    const symbol = row.symbol.trim().toUpperCase();
    const addresses = symbols.get(symbol) ?? new Set<string>();
    addresses.add(row.baseAddress);
    symbols.set(symbol, addresses);
  }
  return symbols;
}

export async function getRecentlyProcessedPairAddresses(windowMinutes = 1) {
  const db = await getDb();
  if (!db) return new Set<string>();
  const threshold = new Date(Date.now() - windowMinutes * 60_000);
  const rows = await db.select({ pairAddress: scannerSnapshots.pairAddress }).from(scannerSnapshots).where(gte(scannerSnapshots.fetchedAt, threshold)).limit(500);
  return new Set(rows.map((row) => row.pairAddress));
}

export async function getCandidateHistory(addresses: string[]) {
  const db = await getDb();
  const history = new Map<string, { liquidityUsd: number; decision: ScoredCandidate["decision"]; fetchedAt: number }[]>();
  if (!db || !addresses.length) return history;
  const threshold = new Date(Date.now() - 20 * 60_000);
  const rows = await db.select({ baseAddress: scannerSnapshots.baseAddress, liquidityUsd: scannerSnapshots.liquidityUsd, decision: scannerSnapshots.decision, fetchedAt: scannerSnapshots.fetchedAt }).from(scannerSnapshots).where(and(inArray(scannerSnapshots.baseAddress, addresses), gte(scannerSnapshots.fetchedAt, threshold))).orderBy(desc(scannerSnapshots.fetchedAt)).limit(1000);
  for (const row of rows) {
    const records = history.get(row.baseAddress) ?? [];
    records.push({ liquidityUsd: Number(row.liquidityUsd), decision: row.decision, fetchedAt: row.fetchedAt.getTime() });
    history.set(row.baseAddress, records);
  }
  return history;
}

export async function rememberRuggedDeployer(creatorAddress: string) {
  const db = await getDb();
  if (!db) return;
  const [existing] = await db.select().from(knownRuggedDeployers).where(eq(knownRuggedDeployers.creatorAddress, creatorAddress)).limit(1);
  if (existing) {
    await db.update(knownRuggedDeployers).set({ lastSeenAt: new Date(), hitCount: existing.hitCount + 1 }).where(eq(knownRuggedDeployers.id, existing.id));
  } else {
    await db.insert(knownRuggedDeployers).values({ creatorAddress });
  }
}

export async function getKnownRuggedDeployers(addresses: string[]) {
  const db = await getDb();
  const found = new Map<string, number>();
  if (!db || !addresses.length) return found;
  const rows = await db.select().from(knownRuggedDeployers).where(inArray(knownRuggedDeployers.creatorAddress, addresses));
  for (const row of rows) found.set(row.creatorAddress, row.firstSeenAt.getTime());
  return found;
}

export async function getCreatorSprayCounts(addresses: string[]) {
  const db = await getDb();
  const counts = new Map<string, number>();
  if (!db || !addresses.length) return counts;
  const threshold = new Date(Date.now() - 24 * 60 * 60_000);
  const rows = await db.select({ creatorAddress: securityReports.creatorAddress, baseAddress: securityReports.baseAddress }).from(securityReports).where(and(inArray(securityReports.creatorAddress, addresses), gte(securityReports.checkedAt, threshold))).limit(3000);
  const tokensByCreator = new Map<string, Set<string>>();
  for (const row of rows) if (row.creatorAddress) { const tokens = tokensByCreator.get(row.creatorAddress) ?? new Set<string>(); tokens.add(row.baseAddress); tokensByCreator.set(row.creatorAddress, tokens); }
  for (const [creator, tokens] of Array.from(tokensByCreator.entries())) counts.set(creator, tokens.size);
  return counts;
}

export async function getScannerSettings(): Promise<ScannerSettings> {
  const db = await getDb();
  if (!db) return DEFAULT_SCANNER_SETTINGS;
  const [row] = await db.select().from(scannerSettings).where(eq(scannerSettings.scopeKey, "public-scanner")).limit(1);
  if (!row) return DEFAULT_SCANNER_SETTINGS;
  return { strictSecurity: row.strictSecurity, opportunityAlertThreshold: Number(row.opportunityAlertThreshold), riskAlertThreshold: Number(row.riskAlertThreshold), cooldownMinutes: row.cooldownMinutes, deepScanLimit: row.deepScanLimit };
}

export async function saveScannerSettings(settings: ScannerSettings) {
  const db = await getDb();
  if (!db) return;
  await db.insert(scannerSettings).values({ scopeKey: "public-scanner", ...settings }).onDuplicateKeyUpdate({ set: { ...settings, updatedAt: new Date() } });
}

export async function recordSourceHealth(event: HealthEvent) {
  const db = await getDb();
  if (!db) return;
  await db.insert(sourceHealthEvents).values({ ...event, detail: event.detail ?? null });
}

export function healthEventFromTelemetry(telemetry: SourceTelemetry, intervalMs: number): HealthEvent {
  const eventType: HealthEvent["eventType"] = telemetry.throttled ? "throttled" : telemetry.errorCount ? "error" : telemetry.slowRequestCount ? "slow" : "normal";
  return { source: telemetry.source, eventType, responseStatus: telemetry.latestStatus, latencyMs: telemetry.maxLatencyMs, intervalMs, detail: `requests=${telemetry.requestCount}; slow=${telemetry.slowRequestCount}; errors=${telemetry.errorCount}` };
}

export async function getSourceHealthSummary() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourceHealthEvents).orderBy(desc(sourceHealthEvents.occurredAt)).limit(12).then((rows) => rows.map((row) => ({ ...row, occurredAt: row.occurredAt.getTime() })));
}

export async function storeScan(input: StoreScanInput) {
  const db = await getDb();
  if (!db) return { scanId: null, persisted: false };
  const result = await db.insert(scanRuns).values({
    source: input.source, status: input.status, executionOrigin: input.executionOrigin, candidateCount: input.candidates.length,
    visibleCount: input.visibleCount, filterJson: JSON.stringify(input.filters), errorMessage: input.errorMessage ?? null, fetchedAt: input.fetchedAt,
  });
  const insertHeader = Array.isArray(result) ? result[0] : result;
  const scanId = Number((insertHeader as { insertId?: number } | undefined)?.insertId ?? 0);
  if (!scanId || !input.candidates.length) return { scanId: scanId || null, persisted: Boolean(scanId) };
  await db.insert(scannerSnapshots).values(input.candidates.map((candidate) => ({
    scanRunId: scanId, pairAddress: candidate.pairAddress, baseAddress: candidate.baseAddress, symbol: candidate.symbol, name: candidate.name,
    dexId: candidate.dexId, sourceUrl: candidate.sourceUrl, priceUsd: candidate.priceUsd, liquidityUsd: candidate.liquidityUsd,
    volumeH1: candidate.volumeH1, volumeH24: candidate.volumeH24, transactionsH1: candidate.transactionsH1, priceChangeM5: candidate.priceChangeM5,
    priceChangeH1: candidate.priceChangeH1, pairCreatedAt: candidate.pairCreatedAt ? new Date(candidate.pairCreatedAt) : null,
    opportunityScore: candidate.opportunityScore, riskScore: candidate.riskScore, scoreDelta: candidate.scoreDelta, decision: candidate.decision,
    liquidityDeltaPct: candidate.liquidityDeltaPct, liquidityPullDetected: candidate.liquidityPullDetected, liquidityGrowthStable: candidate.liquidityGrowthStable,
    liquidDexCount: candidate.liquidDexCount, metadataCompleteness: candidate.metadataCompleteness, jupiterPriceUsd: candidate.jupiterPriceUsd, priceDivergencePct: candidate.priceDivergencePct,
    holderClusterScore: candidate.security.holderClusterScore, bundleDetected: candidate.security.bundleDetected, washTradingScore: candidate.security.washTradingScore,
    fundingSourceOverlap: candidate.security.fundingSourceOverlap, token2022Flags: JSON.stringify(candidate.security.token2022Flags), lpBurnVerified: candidate.security.lpBurnVerified,
    factorsJson: JSON.stringify(candidate.factors), warningsJson: JSON.stringify(candidate.warnings), fetchedAt: input.fetchedAt,
  })));
  await db.insert(securityReports).values(input.candidates.map((candidate) => ({
    scanRunId: scanId, baseAddress: candidate.baseAddress, pairAddress: candidate.pairAddress, symbol: candidate.symbol,
    source: candidate.security.source, status: candidate.security.status, mintAuthorityOpen: candidate.security.mintAuthorityOpen,
    freezeAuthorityOpen: candidate.security.freezeAuthorityOpen, lpLockStatus: candidate.security.lpLockStatus,
    holderTopPct: candidate.security.holderTopPct, holderTop10Pct: candidate.security.holderTop10Pct, creatorAddress: candidate.security.creatorAddress,
    ruggedCreator: candidate.security.ruggedCreator, knownRuggedDeployer: candidate.security.knownRuggedDeployer, sprayCount24h: candidate.security.sprayCount24h, rugcheckScore: candidate.security.rugcheckScore, symbolConflict: candidate.security.symbolConflict,
    deepScanApplied: candidate.security.deepScanApplied, holderClusterScore: candidate.security.holderClusterScore, bundleDetected: candidate.security.bundleDetected,
    washTradingScore: candidate.security.washTradingScore, fundingSourceOverlap: candidate.security.fundingSourceOverlap, token2022Flags: JSON.stringify(candidate.security.token2022Flags),
    lpBurnVerified: candidate.security.lpBurnVerified, flagsJson: JSON.stringify(candidate.security.flags), checkedAt: new Date(candidate.security.checkedAt),
  })));
  return { scanId, persisted: true };
}

export async function getLatestDashboard() {
  const db = await getDb();
  if (!db) return null;
  const [run] = await db.select().from(scanRuns).orderBy(desc(scanRuns.fetchedAt)).limit(1);
  if (!run || run.status === "failed") return null;
  const rows = await db.select().from(scannerSnapshots).where(eq(scannerSnapshots.scanRunId, run.id)).orderBy(desc(scannerSnapshots.opportunityScore));
  const addresses = rows.map((row) => row.baseAddress);
  const recentSecurity = addresses.length ? await db.select().from(securityReports).where(inArray(securityReports.baseAddress, addresses)).orderBy(desc(securityReports.checkedAt)).limit(300) : [];
  const securityByAddress = new Map<string, SecurityReport>();
  for (const row of recentSecurity) if (!securityByAddress.has(row.baseAddress)) securityByAddress.set(row.baseAddress, mapSecurity(row));
  return {
    scanId: run.id, source: run.source, fetchedAt: run.fetchedAt, totalCandidates: run.candidateCount, visibleCount: run.visibleCount,
    executionOrigin: run.executionOrigin, filters: parseFilters(run.filterJson), persistenceAvailable: true,
    candidates: rows.map((row) => ({
      pairAddress: row.pairAddress, baseAddress: row.baseAddress, symbol: row.symbol, name: row.name, dexId: row.dexId, sourceUrl: row.sourceUrl,
      priceUsd: num(row.priceUsd), liquidityUsd: Number(row.liquidityUsd), volumeH1: Number(row.volumeH1), volumeH24: Number(row.volumeH24),
      transactionsH1: row.transactionsH1, buysH1: 0, sellsH1: 0, priceChangeM5: Number(row.priceChangeM5), priceChangeH1: Number(row.priceChangeH1), priceChangeH6: 0, priceChangeH24: 0,
      pairCreatedAt: toDateMs(row.pairCreatedAt), ageHours: row.pairCreatedAt ? Math.round(((Date.now() - row.pairCreatedAt.getTime()) / 3_600_000) * 10) / 10 : null,
      opportunityScore: Number(row.opportunityScore), riskScore: Number(row.riskScore), scoreDelta: Number(row.scoreDelta), decision: row.decision,
      liquidityDeltaPct: num(row.liquidityDeltaPct), liquidityPullDetected: row.liquidityPullDetected, liquidityGrowthStable: row.liquidityGrowthStable,
      liquidDexCount: row.liquidDexCount, metadataCompleteness: row.metadataCompleteness, jupiterPriceUsd: num(row.jupiterPriceUsd), priceDivergencePct: num(row.priceDivergencePct), discoverySources: [], factors: parseJsonArray(row.factorsJson), warnings: parseJsonArray(row.warningsJson),
      security: securityByAddress.get(row.baseAddress) ?? null,
    })),
  };
}

export async function getSavedFilters() {
  const db = await getDb();
  if (!db) return DEFAULT_FILTERS;
  const [setting] = await db.select().from(filterSettings).where(eq(filterSettings.scopeKey, "public-dashboard")).limit(1);
  return parseFilters(setting?.settingsJson);
}

export async function saveFilters(filters: ScanFilters) {
  const db = await getDb();
  if (!db) return;
  await db.insert(filterSettings).values({ scopeKey: "public-dashboard", settingsJson: JSON.stringify(filters) }).onDuplicateKeyUpdate({ set: { settingsJson: JSON.stringify(filters), updatedAt: new Date() } });
}

export async function listWatchlist() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(watchlist).orderBy(desc(watchlist.addedAt)).then((rows) => rows.map((row) => ({ ...row, addedAt: row.addedAt.getTime() })));
}

export async function addToWatchlist(input: { baseAddress: string; pairAddress: string; symbol: string; name: string; sourceUrl: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(watchlist).values(input).onDuplicateKeyUpdate({ set: { pairAddress: input.pairAddress, symbol: input.symbol, name: input.name, sourceUrl: input.sourceUrl } });
  return true;
}

export async function removeFromWatchlist(baseAddress: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(watchlist).where(eq(watchlist.baseAddress, baseAddress));
  return true;
}

export async function queuePerformanceCheckpoints(scanId: number, candidates: ScoredCandidate[]) {
  const db = await getDb();
  if (!db) return;
  const selected = candidates.filter((candidate) => candidate.decision === "monitor" && candidate.priceUsd && candidate.priceUsd > 0);
  if (!selected.length) return;
  const addresses = selected.map((candidate) => candidate.baseAddress);
  const existing = await db.select({ baseAddress: performanceCheckpoints.baseAddress }).from(performanceCheckpoints).where(and(inArray(performanceCheckpoints.baseAddress, addresses), eq(performanceCheckpoints.outcome, "pending")));
  const pending = new Set(existing.map((row) => row.baseAddress));
  const now = Date.now();
  const entries = selected.filter((candidate) => !pending.has(candidate.baseAddress)).flatMap((candidate) => [60, 360, 1440].map((horizonMinutes) => ({
    scanRunId: scanId, baseAddress: candidate.baseAddress, symbol: candidate.symbol, sourceUrl: candidate.sourceUrl, opportunityScore: candidate.opportunityScore,
    riskScore: candidate.riskScore, baselinePriceUsd: candidate.priceUsd as number, horizonMinutes, dueAt: new Date(now + horizonMinutes * 60_000),
  })));
  if (entries.length) await db.insert(performanceCheckpoints).values(entries);
}

export async function getDuePerformanceChecks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(performanceCheckpoints).where(and(eq(performanceCheckpoints.outcome, "pending"), lte(performanceCheckpoints.dueAt, new Date()))).limit(80);
}

export async function settlePerformanceCheckpoint(id: number, observedPriceUsd: number | null) {
  const db = await getDb();
  if (!db) return;
  if (observedPriceUsd === null) {
    await db.update(performanceCheckpoints).set({ outcome: "unavailable", observedAt: new Date() }).where(eq(performanceCheckpoints.id, id));
    return;
  }
  const [entry] = await db.select().from(performanceCheckpoints).where(eq(performanceCheckpoints.id, id)).limit(1);
  if (!entry) return;
  const returnPct = ((observedPriceUsd - Number(entry.baselinePriceUsd)) / Number(entry.baselinePriceUsd)) * 100;
  await db.update(performanceCheckpoints).set({ observedPriceUsd, observedAt: new Date(), returnPct, outcome: returnPct > 0 ? "success" : "failed" }).where(eq(performanceCheckpoints.id, id));
}

export async function getPerformanceReport() {
  const db = await getDb();
  if (!db) return { totalSettled: 0, byBand: [] as { band: string; total: number; success: number; failed: number; successRate: number; averageReturn: number }[] };
  const rows = await db.select().from(performanceCheckpoints).where(and(eq(performanceCheckpoints.horizonMinutes, 1440), inArray(performanceCheckpoints.outcome, ["success", "failed"])));
  const buckets = new Map<string, { total: number; success: number; failed: number; returns: number[] }>();
  for (const row of rows) {
    const score = Number(row.opportunityScore);
    const band = score >= 80 ? "80–100" : score >= 65 ? "65–79" : score >= 50 ? "50–64" : "أقل من 50";
    const bucket = buckets.get(band) ?? { total: 0, success: 0, failed: 0, returns: [] };
    bucket.total += 1;
    if (row.outcome === "success") bucket.success += 1; else bucket.failed += 1;
    if (row.returnPct !== null) bucket.returns.push(Number(row.returnPct));
    buckets.set(band, bucket);
  }
  const order = ["80–100", "65–79", "50–64", "أقل من 50"];
  return { totalSettled: rows.length, byBand: order.map((band) => {
    const bucket = buckets.get(band) ?? { total: 0, success: 0, failed: 0, returns: [] };
    return { band, total: bucket.total, success: bucket.success, failed: bucket.failed, successRate: bucket.total ? Math.round((bucket.success / bucket.total) * 1000) / 10 : 0, averageReturn: bucket.returns.length ? Math.round((bucket.returns.reduce((sum, value) => sum + value, 0) / bucket.returns.length) * 10) / 10 : 0 };
  }) };
}

export async function wasRecentlyAlerted(baseAddress: string, cooldownMinutes: number) {
  const db = await getDb();
  if (!db) return false;
  const threshold = new Date(Date.now() - cooldownMinutes * 60_000);
  const [event] = await db.select().from(alertEvents).where(and(eq(alertEvents.baseAddress, baseAddress), gte(alertEvents.createdAt, threshold))).orderBy(desc(alertEvents.createdAt)).limit(1);
  return Boolean(event);
}

export async function recordInAppAlert(candidate: ScoredCandidate, detail: string, alertType: "threshold" | "liquidity_pull" | "decision_flip" = "threshold") {
  const db = await getDb();
  if (!db) return;
  await db.insert(alertEvents).values({ baseAddress: candidate.baseAddress, symbol: candidate.symbol, opportunityScore: candidate.opportunityScore, riskScore: candidate.riskScore, channel: "in_app", alertType, deliveryStatus: "sent", detail });
}

export async function recordTelegramAlert(candidate: ScoredCandidate, deliveryStatus: "sent" | "skipped" | "failed", detail: string, alertType: "threshold" | "liquidity_pull" | "decision_flip" = "threshold") {
  const db = await getDb();
  if (!db) return;
  await db.insert(alertEvents).values({ baseAddress: candidate.baseAddress, symbol: candidate.symbol, opportunityScore: candidate.opportunityScore, riskScore: candidate.riskScore, channel: "telegram", alertType, deliveryStatus, detail });
}

export async function getRecentAlerts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alertEvents).orderBy(desc(alertEvents.createdAt)).limit(8).then((rows) => rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime() })));
}
