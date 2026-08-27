import { runEarlyDiscovery, runScanner } from "./scanner/scanService";

const EARLY_BASE_INTERVAL_MS = 20_000;
const EARLY_MAX_INTERVAL_MS = 60_000;
const FULL_BASE_INTERVAL_MS = 60_000;
const FULL_MAX_INTERVAL_MS = 10 * 60_000;
let earlyIntervalMs = EARLY_BASE_INTERVAL_MS;
let fullIntervalMs = FULL_BASE_INTERVAL_MS;
let nextEarlyAt = 0;
let nextFullAt = 0;
let stopped = false;
const runOnce = process.env.WORKER_RUN_ONCE === "1";

function adaptFullInterval(result: Awaited<ReturnType<typeof runScanner>>) {
  const telemetry = result.sourceTelemetry;
  if (telemetry.throttled || telemetry.latestStatus === 429) {
    fullIntervalMs = Math.min(FULL_MAX_INTERVAL_MS, Math.round(fullIntervalMs * 1.8));
    return;
  }
  if (telemetry.errorCount > 0 || telemetry.slowRequestCount > 0 || telemetry.maxLatencyMs >= 4_000) {
    fullIntervalMs = Math.min(FULL_MAX_INTERVAL_MS, Math.round(fullIntervalMs * 1.35));
    return;
  }
  fullIntervalMs = Math.max(FULL_BASE_INTERVAL_MS, fullIntervalMs - 15_000);
}

function adaptEarlyInterval(result: Awaited<ReturnType<typeof runEarlyDiscovery>>) {
  const telemetry = result.sourceTelemetry;
  if (telemetry.throttled || telemetry.latestStatus === 429) {
    earlyIntervalMs = Math.min(EARLY_MAX_INTERVAL_MS, Math.round(earlyIntervalMs * 1.5));
    return;
  }
  if (telemetry.errorCount > 0 || telemetry.slowRequestCount > 0 || telemetry.maxLatencyMs >= 4_000) {
    earlyIntervalMs = Math.min(EARLY_MAX_INTERVAL_MS, Math.round(earlyIntervalMs * 1.25));
    return;
  }
  earlyIntervalMs = Math.max(EARLY_BASE_INTERVAL_MS, earlyIntervalMs - 5_000);
}

async function scanLoop() {
  if (stopped) return;
  const now = Date.now();
  if (now >= nextEarlyAt) {
    try {
      const result = await runEarlyDiscovery({ intervalMs: earlyIntervalMs });
      adaptEarlyInterval(result);
      console.info(`[Worker] early discovery complete: ${result.totalCandidates} candidates, ${result.discoveries.length} new, next interval ${earlyIntervalMs}ms`);
    } catch (error) {
      earlyIntervalMs = Math.min(EARLY_MAX_INTERVAL_MS, Math.round(earlyIntervalMs * 1.5));
      console.error("[Worker] early discovery failed; backing off", error instanceof Error ? error.message : error);
    }
    nextEarlyAt = Date.now() + earlyIntervalMs;
  }
  if (now >= nextFullAt) {
    try {
      const result = await runScanner({ origin: "worker", intervalMs: fullIntervalMs });
      adaptFullInterval(result);
      console.info(`[Worker] confirmed scan complete: ${result.totalCandidates} candidates, next interval ${fullIntervalMs}ms`);
    } catch (error) {
      fullIntervalMs = Math.min(FULL_MAX_INTERVAL_MS, Math.round(fullIntervalMs * 1.6));
      console.error("[Worker] confirmed scan failed; backing off", error instanceof Error ? error.message : error);
    }
    nextFullAt = Date.now() + fullIntervalMs;
  }
  if (runOnce) {
    process.exit(0);
  }
  if (!stopped) setTimeout(scanLoop, Math.max(1_000, Math.min(nextEarlyAt, nextFullAt) - Date.now()));
}

process.once("SIGTERM", () => { stopped = true; });
process.once("SIGINT", () => { stopped = true; });
void scanLoop();
