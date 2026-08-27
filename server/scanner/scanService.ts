import { applyFilters, scoreCandidates } from "./scoring";
import { fetchSecurityReport } from "./security";
import { fetchLatestSolanaMarket, fetchTokenPriceUsd } from "./source";
import type { ScanFilters, ScannerSettings, ScoredCandidate, SecurityReport } from "./types";
import {
  getDuePerformanceChecks,
  getKnownSymbolAddresses,
  getPreviousScores,
  getRecentlyProcessedPairAddresses,
  getSavedFilters,
  getScannerSettings,
  healthEventFromTelemetry,
  queuePerformanceCheckpoints,
  recordInAppAlert,
  recordTelegramAlert,
  recordSourceHealth,
  settlePerformanceCheckpoint,
  storeScan,
  wasRecentlyAlerted,
} from "../scannerDb";
import { sendTelegramAlert } from "../telegram";

export type ScanOrigin = "manual" | "worker";
export type ScannerRun = {
  scanId: number | null;
  source: string;
  fetchedAt: Date;
  totalCandidates: number;
  candidates: ScoredCandidate[];
  filters: ScanFilters;
  settings: ScannerSettings;
  persistenceAvailable: boolean;
  sourceTelemetry: { throttled: boolean; slowRequestCount: number; errorCount: number; latestStatus: number | null; maxLatencyMs: number };
};

const isSymbolConflict = (address: string, symbol: string, knownSymbols: Map<string, Set<string>>) => {
  const addresses = knownSymbols.get(symbol.trim().toUpperCase());
  return Boolean(addresses && addresses.size > 0 && !addresses.has(address));
};

async function assessSecurity(candidates: Awaited<ReturnType<typeof fetchLatestSolanaMarket>>["candidates"], knownSymbols: Map<string, Set<string>>, deepScanLimit: number, recentPairs: Set<string>) {
  const preliminaryReports = new Map<string, SecurityReport>();
  const processable = candidates.filter((candidate) => !recentPairs.has(candidate.pairAddress));
  const reports = await Promise.all(processable.map(async (candidate) => [candidate.baseAddress, await fetchSecurityReport(candidate, isSymbolConflict(candidate.baseAddress, candidate.symbol, knownSymbols), false)] as const));
  for (const [address, report] of reports) preliminaryReports.set(address, report);
  const preScored = scoreCandidates(candidates, new Map(), preliminaryReports).filter((candidate) => candidate.security.status !== "flagged").sort((left, right) => right.opportunityScore - left.opportunityScore);
  const deepAddresses = new Set(preScored.slice(0, deepScanLimit).map((candidate) => candidate.baseAddress));
  const deepReports = await Promise.all(candidates.filter((candidate) => deepAddresses.has(candidate.baseAddress)).map(async (candidate) => [candidate.baseAddress, await fetchSecurityReport(candidate, isSymbolConflict(candidate.baseAddress, candidate.symbol, knownSymbols), true)] as const));
  for (const [address, report] of deepReports) preliminaryReports.set(address, report);
  return preliminaryReports;
}

async function recordCandidateAlerts(candidates: ScoredCandidate[], settings: ScannerSettings) {
  const matches = candidates.filter((candidate) => candidate.decision === "monitor" && candidate.opportunityScore >= settings.opportunityAlertThreshold && candidate.riskScore <= settings.riskAlertThreshold);
  for (const candidate of matches) {
    if (!await wasRecentlyAlerted(candidate.baseAddress, settings.cooldownMinutes)) {
      await recordInAppAlert(candidate, `إشارة تجاوزت العتبات المخصصة؛ الفحص للقراءة فقط وليس توصية تداول.`);
      const delivery = await sendTelegramAlert(candidate);
      await recordTelegramAlert(candidate, delivery.status, delivery.detail);
    }
  }
}

export async function settleDuePerformance() {
  const due = await getDuePerformanceChecks();
  await Promise.all(due.map(async (checkpoint) => {
    try { await settlePerformanceCheckpoint(checkpoint.id, await fetchTokenPriceUsd(checkpoint.baseAddress)); }
    catch { await settlePerformanceCheckpoint(checkpoint.id, null); }
  }));
}

export async function runScanner(options: { origin: ScanOrigin; filters?: ScanFilters; intervalMs?: number }): Promise<ScannerRun> {
  const startedAt = new Date();
  const filters = options.filters ?? await getSavedFilters();
  const settings = await getScannerSettings();
  const intervalMs = options.intervalMs ?? 60_000;
  try {
    const [previousScores, knownSymbols, recentPairs, market] = await Promise.all([
      getPreviousScores(), getKnownSymbolAddresses(), getRecentlyProcessedPairAddresses(1), fetchLatestSolanaMarket(),
    ]);
    await recordSourceHealth(healthEventFromTelemetry(market.telemetry, intervalMs));
    const candidatesToProcess = options.origin === "worker"
      ? market.candidates.filter((candidate) => !recentPairs.has(candidate.pairAddress))
      : market.candidates;
    const securityByAddress = await assessSecurity(candidatesToProcess, knownSymbols, settings.deepScanLimit, new Set());
    const candidates = scoreCandidates(candidatesToProcess, previousScores, securityByAddress);
    const visibleCandidates = applyFilters(candidates, filters, settings.strictSecurity);
    const stored = await storeScan({ source: "DEX Screener public API + RugCheck", status: candidates.length ? "success" : "partial", executionOrigin: options.origin, filters, candidates, visibleCount: visibleCandidates.length, fetchedAt: startedAt });
    if (stored.scanId) await Promise.all([queuePerformanceCheckpoints(stored.scanId, candidates), recordCandidateAlerts(visibleCandidates, settings), settleDuePerformance()]);
    return {
      scanId: stored.scanId, source: "DEX Screener public API + RugCheck", fetchedAt: startedAt, totalCandidates: candidates.length, candidates: visibleCandidates,
      filters, settings, persistenceAvailable: stored.persisted,
      sourceTelemetry: { throttled: market.telemetry.throttled, slowRequestCount: market.telemetry.slowRequestCount, errorCount: market.telemetry.errorCount, latestStatus: market.telemetry.latestStatus, maxLatencyMs: market.telemetry.maxLatencyMs },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل تحديث المصدر";
    await recordSourceHealth({ source: "DEX Screener", eventType: "error", responseStatus: null, latencyMs: 0, intervalMs, detail: message });
    await storeScan({ source: "DEX Screener public API + RugCheck", status: "failed", executionOrigin: options.origin, filters, candidates: [], visibleCount: 0, fetchedAt: startedAt, errorMessage: message });
    throw new Error(message);
  }
}
