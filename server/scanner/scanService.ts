import { applyFilters, scoreCandidates, type CandidateSignals } from "./scoring";
import { fetchSecurityReport } from "./security";
import { fetchJupiterPrices, fetchLatestSolanaMarket, fetchTokenPriceUsd } from "./source";
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
  getScannerSettings,
  healthEventFromTelemetry,
  queuePerformanceCheckpoints,
  recordInAppAlert,
  recordTelegramAlert,
  recordSourceHealth,
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

async function recordCandidateAlerts(candidates: ScoredCandidate[], eligibleForThreshold: ScoredCandidate[], settings: ScannerSettings, previousDecisions: Map<string, ScoredCandidate["decision"]>) {
  const urgent = candidates.filter((candidate) => candidate.liquidityPullDetected || ((previousDecisions.get(candidate.baseAddress) === "monitor" || previousDecisions.get(candidate.baseAddress) === "caution") && candidate.decision === "avoid"));
  for (const candidate of urgent) {
    const alertType = candidate.liquidityPullDetected ? "liquidity_pull" : "decision_flip";
    const detail = candidate.liquidityPullDetected ? "تحذير عاجل: احتمال سحب سيولة نشط الآن؛ استُبعد التوكن من أفضل الآن والتنبيهات العادية." : "تحذير عاجل: توكن كان تحت المراقبة أصبح الآن في قائمة التجنب.";
    await recordInAppAlert(candidate, detail, alertType);
    const delivery = await sendTelegramAlert(candidate, alertType);
    await recordTelegramAlert(candidate, delivery.status, delivery.detail, alertType);
  }
  const matches = eligibleForThreshold.filter((candidate) => candidate.decision === "monitor" && candidate.opportunityScore >= settings.opportunityAlertThreshold && candidate.riskScore <= settings.riskAlertThreshold);
  for (const candidate of matches) {
    if (!candidate.liquidityPullDetected && !await wasRecentlyAlerted(candidate.baseAddress, settings.cooldownMinutes)) {
      await recordInAppAlert(candidate, `إشارة تجاوزت العتبات المخصصة؛ الفحص للقراءة فقط وليس توصية تداول.`);
      const delivery = await sendTelegramAlert(candidate, "threshold");
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
    if (stored.scanId) await Promise.all([queuePerformanceCheckpoints(stored.scanId, candidates), recordCandidateAlerts(candidates, visibleCandidates, settings, previousDecisions), settleDuePerformance()]);
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
}
