import { runScanner } from "./scanner/scanService";

const BASE_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 10 * 60_000;
let nextIntervalMs = BASE_INTERVAL_MS;
let stopped = false;
const runOnce = process.env.WORKER_RUN_ONCE === "1";

function adaptInterval(result: Awaited<ReturnType<typeof runScanner>>) {
  const telemetry = result.sourceTelemetry;
  if (telemetry.throttled || telemetry.latestStatus === 429) {
    nextIntervalMs = Math.min(MAX_INTERVAL_MS, Math.round(nextIntervalMs * 1.8));
    return;
  }
  if (telemetry.errorCount > 0 || telemetry.slowRequestCount > 0 || telemetry.maxLatencyMs >= 4_000) {
    nextIntervalMs = Math.min(MAX_INTERVAL_MS, Math.round(nextIntervalMs * 1.35));
    return;
  }
  nextIntervalMs = Math.max(BASE_INTERVAL_MS, nextIntervalMs - 15_000);
}

async function scanLoop() {
  if (stopped) return;
  try {
    const result = await runScanner({ origin: "worker", intervalMs: nextIntervalMs });
    adaptInterval(result);
    console.info(`[Worker] scan complete: ${result.totalCandidates} candidates, next interval ${nextIntervalMs}ms`);
  } catch (error) {
    nextIntervalMs = Math.min(MAX_INTERVAL_MS, Math.round(nextIntervalMs * 1.6));
    console.error("[Worker] scan failed; backing off", error instanceof Error ? error.message : error);
  }
  if (runOnce) {
    process.exit(0);
  }
  if (!stopped) setTimeout(scanLoop, nextIntervalMs);
}

process.once("SIGTERM", () => { stopped = true; });
process.once("SIGINT", () => { stopped = true; });
void scanLoop();
