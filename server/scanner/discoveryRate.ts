export type DiscoveryRateRow = { baseAddress: string; firstSeenAt: Date | number };

export function summarizeDiscoveryRate(rows: DiscoveryRateRow[], nowMs = Date.now(), windowHours = 168) {
  const windowStartMs = nowMs - windowHours * 3_600_000;
  const uniqueTokens = new Set(rows.filter((row) => {
    const seenAt = row.firstSeenAt instanceof Date ? row.firstSeenAt.getTime() : row.firstSeenAt;
    return Number.isFinite(seenAt) && seenAt >= windowStartMs && seenAt <= nowMs;
  }).map((row) => row.baseAddress)).size;
  const sampleHours = Math.max(0, Math.min(windowHours, (nowMs - windowStartMs) / 3_600_000));
  return {
    windowStart: windowStartMs,
    windowEnd: nowMs,
    sampleHours: Math.round(sampleHours * 10) / 10,
    uniqueTokens,
    tokensPerHour: sampleHours > 0 ? Math.round((uniqueTokens / sampleHours) * 100) / 100 : 0,
    status: "collecting" as const,
  };
}
