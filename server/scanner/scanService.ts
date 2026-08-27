import { applyFilters, getGemGateFailures, scoreCandidates, type CandidateSignals } from "./scoring";
import { randomUUID } from "node:crypto";
import { inspectOnchainSecurity } from "./onchain";
import { fetchSecurityReport } from "./security";
import { fetchEarlySolanaDiscovery, fetchJupiterPrices, fetchLatestSolanaMarket, fetchTokenPriceUsd } from "./source";
import type { ScanFilters, ScannerSettings, ScoredCandidate, SecurityReport } from "./types";
import {
  getDuePerformanceChecks,
  getCreatorSprayCounts,
  getCandidateHistory,
  getKnownRuggedDeployers,
  getKnownSymbolAddresses,
  getPreviousScores,
  getRecentlyProcessedPairAddresses,
  getSavedFilters,
  acquireScannerRunLock,
  getScannerSettings,
  healthEventFromTelemetry,
  queuePerformanceCheckpoints,
  promoteEarlyDiscoveries,
  recordInAppAlert,
  recordEarlyDiscoveries,
  recordEarlyWatchAlert,
  recordTelegramAlert,
  recordSourceHealth,
  releaseScannerRunLock,
  rememberRuggedDeployer,
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

export type EarlyDiscoveryRun = {
  fetchedAt: Date;
  totalCandidates: number;
  discoveries: Awaited<ReturnType<typeof recordEarlyDiscoveries>>;
  sourceTelemetry: { throttled: boolean; slowRequestCount: number; errorCount: number; latestStatus: number | null; maxLatencyMs: number };
};

const MAX_SECURITY_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

const isSymbolConflict = (address: string, symbol: string, knownSymbols: Map<string, Set<string>>) => {
  const addresses = knownSymbols.get(symbol.trim().toUpperCase());
  return Boolean(addresses && addresses.size > 0 && !addresses.has(address));
};

async function assessSecurity(candidates: Awaited<ReturnType<typeof fetchLatestSolanaMarket>>["candidates"], knownSymbols: Map<string, Set<string>>, deepScanLimit: number, recentPairs: Set<string>) {
  const preliminaryReports = new Map<string, SecurityReport>();
  const processable = candidates.filter((candidate) => !recentPairs.has(candidate.pairAddress));
  const reports = await mapWithConcurrency(processable, MAX_SECURITY_CONCURRENCY, async (candidate) => [candidate.baseAddress, await fetchSecurityReport(candidate, isSymbolConflict(candidate.baseAddress, candidate.symbol, knownSymbols), false)] as const);
  for (const [address, report] of reports) preliminaryReports.set(address, report);
  const preScored = scoreCandidates(candidates, new Map(), preliminaryReports).filter((candidate) => candidate.security.status !== "flagged").sort((left, right) => right.opportunityScore - left.opportunityScore);
  const effectiveDeepScanLimit = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_URL ? deepScanLimit : Math.min(deepScanLimit, 2);
  const deepAddresses = new Set(preScored.slice(0, effectiveDeepScanLimit).map((candidate) => candidate.baseAddress));
  const deepReports = await mapWithConcurrency(candidates.filter((candidate) => deepAddresses.has(candidate.baseAddress)), MAX_SECURITY_CONCURRENCY, async (candidate) => {
    const report = await fetchSecurityReport(candidate, isSymbolConflict(candidate.baseAddress, candidate.symbol, knownSymbols), true);
    const onchain = await inspectOnchainSecurity(candidate, report.lpMintAddresses);
    return [candidate.baseAddress, {
      ...report,
      source: process.env.HELIUS_API_KEY ? "RugCheck + Helius + Solana RPC" : "RugCheck + Solana RPC",
      status: report.status === "flagged" ? "flagged" : onchain.status === "unavailable" ? "unavailable" : report.status,
      holderClusterScore: onchain.holderClusterScore,
      bundleDetected: onchain.bundleDetected,
      washTradingScore: onchain.washTradingScore,
      fundingSourceOverlap: onchain.fundingSourceOverlap,
      fundingEvidenceStatus: onchain.fundingEvidenceStatus,
      token2022Flags: onchain.token2022Flags,
      lpBurnVerified: onchain.lpBurnVerified,
      flags: Array.from(new Set([...report.flags, ...onchain.flags])),
    }] as const;
  });
  for (const [address, report] of deepReports) preliminaryReports.set(address, report);
  const creators = Array.from(new Set(Array.from(preliminaryReports.values()).map((report) => report.creatorAddress).filter((value): value is string => Boolean(value))));
  const [knownDeployers, sprayCounts] = await Promise.all([getKnownRuggedDeployers(creators), getCreatorSprayCounts(creators)]);
  const currentTokensByCreator = new Map<string, Set<string>>();
  for (const report of Array.from(preliminaryReports.values())) if (report.creatorAddress) { const tokens = currentTokensByCreator.get(report.creatorAddress) ?? new Set<string>(); tokens.add(report.baseAddress); currentTokensByCreator.set(report.creatorAddress, tokens); }
  for (const [address, report] of Array.from(preliminaryReports.entries())) {
    const knownSince = report.creatorAddress ? knownDeployers.get(report.creatorAddress) : undefined;
    const sprayCount24h = report.creatorAddress ? (sprayCounts.get(report.creatorAddress) ?? 0) + (currentTokensByCreator.get(report.creatorAddress)?.size ?? 0) : 0;
    const flags = [...report.flags];
    if (knownSince) flags.push(`الناشر مرتبط بتوكن رَقّ تم رصده سابقاً في ${new Date(knownSince).toLocaleDateString("ar")}`);
    if (sprayCount24h >= 3) flags.push("نمط رش: نفس الناشر أطلق عدة توكنات خلال 24 ساعة");
    preliminaryReports.set(address, { ...report, knownRuggedDeployer: Boolean(knownSince), sprayCount24h, status: knownSince ? "flagged" : report.status, flags: Array.from(new Set(flags)) });
  }
  await Promise.all(Array.from(preliminaryReports.values()).filter((report) => report.ruggedCreator && report.creatorAddress).map((report) => rememberRuggedDeployer(report.creatorAddress as string)));
  return preliminaryReports;
}

function buildLiquiditySignals(candidates: Awaited<ReturnType<typeof fetchLatestSolanaMarket>>["candidates"], history: Awaited<ReturnType<typeof getCandidateHistory>>) {
  const signals = new Map<string, CandidateSignals>();
  for (const candidate of candidates) {
    const prior = [...(history.get(candidate.baseAddress) ?? [])].sort((left, right) => left.fetchedAt - right.fetchedAt);
    const latest = prior.at(-1);
    const liquidityDeltaPct = latest?.liquidityUsd && latest.liquidityUsd > 0 ? Math.round(((candidate.liquidityUsd - latest.liquidityUsd) / latest.liquidityUsd) * 1000) / 10 : null;
    const liquidityPullDetected = Boolean(latest && Date.now() - latest.fetchedAt <= 5 * 60_000 && (liquidityDeltaPct ?? 0) <= -38);
    const sequence = [...prior.slice(-2).map((entry) => entry.liquidityUsd), candidate.liquidityUsd];
    const liquidityGrowthStable = sequence.length === 3 && sequence[0] > 0 && sequence[1] > sequence[0] && sequence[2] > sequence[1] && sequence.every((value, index) => index === 0 || value >= sequence[index - 1] * 0.95);
    signals.set(candidate.baseAddress, { liquidityDeltaPct, liquidityPullDetected, liquidityGrowthStable });
  }
  return signals;
}

export function selectThresholdCandidates(candidates: ScoredCandidate[], settings: ScannerSettings) {
  return candidates.filter((candidate) => getGemGateFailures(candidate, settings).length === 0);
}

async function recordCandidateAlerts(candidates: ScoredCandidate[], eligibleForThreshold: ScoredCandidate[], settings: ScannerSettings, _previousDecisions: Map<string, ScoredCandidate["decision"]>) {
  const matches = selectThresholdCandidates(eligibleForThreshold, settings);
  for (const candidate of matches) {
    if (!candidate.liquidityPullDetected && !await wasRecentlyAlerted(candidate.baseAddress, settings.cooldownMinutes)) {
      await recordInAppAlert(candidate, "جوهرة اجتازت بوابات الفرز؛ الفحص للقراءة فقط وليس توصية تداول.");
      const delivery = await sendTelegramAlert(candidate, "threshold");
      await recordTelegramAlert(candidate, delivery.status, delivery.detail);
    }
  }
}

async function recordEarlyDiscoveryAlerts(discoveries: Awaited<ReturnType<typeof recordEarlyDiscoveries>>) {
  for (const watch of discoveries.slice(0, 4)) {
    await recordEarlyWatchAlert(watch, "رصد مبكر داخلي فقط؛ لا يُرسل إلى Telegram قبل اكتمال فحوص الأمان والسيولة والتسعير.");
  }
}

export function selectConfirmedCandidates(candidates: ScoredCandidate[]) {
  return candidates.filter((candidate) => candidate.decision === "monitor" && candidate.security.status === "passed" && candidate.liquidityUsd >= 10_000 && candidate.jupiterPriceUsd !== null && candidate.priceDivergencePct !== null && candidate.priceDivergencePct <= 12 && !candidate.liquidityPullDetected);
}

export function excludePromotedFromThreshold(candidates: ScoredCandidate[], promoted: ScoredCandidate[]) {
  const promotedAddresses = new Set(promoted.map((candidate) => candidate.baseAddress));
  return candidates.filter((candidate) => !promotedAddresses.has(candidate.baseAddress));
}

async function recordConfirmedAlerts(candidates: ScoredCandidate[]) {
  for (const candidate of candidates) {
    const delivery = await sendTelegramAlert(candidate, "confirmed_alert");
    await recordTelegramAlert(candidate, delivery.status, delivery.detail, "confirmed_alert");
  }
}

export async function settleDuePerformance() {
  const due = await getDuePerformanceChecks();
  await Promise.all(due.map(async (checkpoint) => {
    try { await settlePerformanceCheckpoint(checkpoint.id, await fetchTokenPriceUsd(checkpoint.baseAddress)); }
    catch { await settlePerformanceCheckpoint(checkpoint.id, null); }
  }));
}

export async function runEarlyDiscovery(options: { intervalMs: number }): Promise<EarlyDiscoveryRun> {
  const lockToken = randomUUID();
  await acquireScannerRunLock(lockToken);
  const fetchedAt = new Date();
  try {
    const market = await fetchEarlySolanaDiscovery();
    await recordSourceHealth(healthEventFromTelemetry(market.telemetry, options.intervalMs));
    const discoveries = await recordEarlyDiscoveries(market.candidates);
    await recordEarlyDiscoveryAlerts(discoveries);
    return {
      fetchedAt, totalCandidates: market.candidates.length, discoveries,
      sourceTelemetry: { throttled: market.telemetry.throttled, slowRequestCount: market.telemetry.slowRequestCount, errorCount: market.telemetry.errorCount, latestStatus: market.telemetry.latestStatus, maxLatencyMs: market.telemetry.maxLatencyMs },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل الرصد المبكر";
    await recordSourceHealth({ source: "DEX Screener Early Discovery", eventType: "error", responseStatus: null, latencyMs: 0, intervalMs: options.intervalMs, detail: message });
    throw new Error(message);
  } finally {
    await releaseScannerRunLock(lockToken).catch((error) => console.error("[Scanner] تعذر تحرير قفل الرصد المبكر", error));
  }
}

export async function runScanner(options: { origin: ScanOrigin; filters?: ScanFilters; intervalMs?: number }): Promise<ScannerRun> {
  const lockToken = randomUUID();
  await acquireScannerRunLock(lockToken);
  try {
    const startedAt = new Date();
    const filters = options.filters ?? await getSavedFilters();
    const settings = await getScannerSettings();
    const intervalMs = options.intervalMs ?? 60_000;
    try {
      const [previousScores, knownSymbols, recentPairs, market] = await Promise.all([
        getPreviousScores(), getKnownSymbolAddresses(), getRecentlyProcessedPairAddresses(1), fetchLatestSolanaMarket(),
      ]);
      await recordSourceHealth(healthEventFromTelemetry(market.telemetry, intervalMs));
      const candidatesToProcess = market.candidates;
      const history = await getCandidateHistory(candidatesToProcess.map((candidate) => candidate.baseAddress));
      const previousDecisions = new Map(Array.from(history.entries()).flatMap(([address, records]) => records.length ? [[address, records[0].decision] as const] : []));
      const securityByAddress = await assessSecurity(candidatesToProcess, knownSymbols, settings.deepScanLimit, new Set());
      const preScored = scoreCandidates(candidatesToProcess, previousScores, securityByAddress);
      const priceCheckAddresses = preScored.filter((candidate) => candidate.security.status === "passed" && candidate.decision !== "avoid").sort((left, right) => right.opportunityScore - left.opportunityScore).slice(0, settings.deepScanLimit).map((candidate) => candidate.baseAddress);
      const jupiter = await fetchJupiterPrices(priceCheckAddresses);
      const liquiditySignals = buildLiquiditySignals(candidatesToProcess, history);
      const signalsByAddress = new Map<string, CandidateSignals>(priceCheckAddresses.map((address) => [address, { ...liquiditySignals.get(address), jupiterChecked: true, jupiterPriceUsd: jupiter.prices.get(address) ?? null }]));
      for (const [address, signals] of Array.from(liquiditySignals.entries())) if (!signalsByAddress.has(address)) signalsByAddress.set(address, signals);
      const candidates = scoreCandidates(candidatesToProcess, previousScores, securityByAddress, signalsByAddress);
      const visibleCandidates = applyFilters(candidates, filters, settings.strictSecurity);
      const stored = await storeScan({ source: "DEX Screener public API + RugCheck + Jupiter", status: candidates.length ? "success" : "partial", executionOrigin: options.origin, filters, candidates, visibleCount: visibleCandidates.length, fetchedAt: startedAt });
      if (stored.scanId) {
        const promoted = await promoteEarlyDiscoveries(selectConfirmedCandidates(candidates), stored.scanId);
        await Promise.all([
          queuePerformanceCheckpoints(stored.scanId, candidates),
          recordCandidateAlerts(candidates, excludePromotedFromThreshold(visibleCandidates, promoted), settings, previousDecisions),
          recordConfirmedAlerts(promoted),
          settleDuePerformance(),
        ]);
      }
      return {
        scanId: stored.scanId, source: "DEX Screener public API + RugCheck + Jupiter", fetchedAt: startedAt, totalCandidates: candidates.length, candidates: visibleCandidates,
        filters, settings, persistenceAvailable: stored.persisted,
        sourceTelemetry: { throttled: market.telemetry.throttled, slowRequestCount: market.telemetry.slowRequestCount, errorCount: market.telemetry.errorCount, latestStatus: market.telemetry.latestStatus, maxLatencyMs: market.telemetry.maxLatencyMs },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل تحديث المصدر";
      await recordSourceHealth({ source: "DEX Screener", eventType: "error", responseStatus: null, latencyMs: 0, intervalMs, detail: message });
      await storeScan({ source: "DEX Screener public API + RugCheck", status: "failed", executionOrigin: options.origin, filters, candidates: [], visibleCount: 0, fetchedAt: startedAt, errorMessage: message });
      throw new Error(message);
    }
  } finally {
    await releaseScannerRunLock(lockToken).catch((error) => console.error("[Scanner] تعذر تحرير قفل الفحص", error));
  }
}
