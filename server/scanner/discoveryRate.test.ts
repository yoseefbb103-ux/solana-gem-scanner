import { describe, expect, it } from "vitest";
import { summarizeDiscoveryRate } from "./discoveryRate";

describe("weekly discovery rate", () => {
  const now = Date.UTC(2026, 7, 28, 12, 0, 0);

  it("counts unique discovered tokens inside the seven-day window", () => {
    const result = summarizeDiscoveryRate([
      { baseAddress: "A", firstSeenAt: now - 2 * 3_600_000 },
      { baseAddress: "A", firstSeenAt: now - 3 * 3_600_000 },
      { baseAddress: "B", firstSeenAt: now - 24 * 3_600_000 },
    ], now);
    expect(result.uniqueTokens).toBe(2);
    expect(result.sampleHours).toBe(168);
    expect(result.tokensPerHour).toBe(0.01);
    expect(result.status).toBe("collecting");
  });

  it("ignores stale, future, and invalid timestamps", () => {
    const result = summarizeDiscoveryRate([
      { baseAddress: "stale", firstSeenAt: now - 169 * 3_600_000 },
      { baseAddress: "future", firstSeenAt: now + 1_000 },
      { baseAddress: "invalid", firstSeenAt: Number.NaN },
      { baseAddress: "valid", firstSeenAt: new Date(now - 1_000) },
    ], now);
    expect(result.uniqueTokens).toBe(1);
  });
});
