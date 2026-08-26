import { describe, expect, it } from "vitest";
import { applyFilters, scoreCandidate } from "./scoring";
import type { TokenCandidate } from "./types";

const baseline: TokenCandidate = {
  pairAddress: "pair", baseAddress: "token", symbol: "TEST", name: "Test Token", dexId: "raydium", sourceUrl: "https://example.com",
  priceUsd: 0.01, liquidityUsd: 75_000, volumeH1: 20_000, volumeH24: 120_000, transactionsH1: 130, buysH1: 75, sellsH1: 55,
  priceChangeM5: 3, priceChangeH1: 12, pairCreatedAt: Date.now() - 5 * 3_600_000,
};

describe("Solana scanner scoring", () => {
  it("rewards balanced liquidity, activity, age, and measured positive momentum", () => {
    const scored = scoreCandidate(baseline);
    expect(scored.opportunityScore).toBeGreaterThan(50);
    expect(scored.riskScore).toBeLessThan(20);
    expect(scored.factors.length).toBeGreaterThan(2);
  });

  it("raises warnings and risk for thin, volatile, very new pairs", () => {
    const scored = scoreCandidate({ ...baseline, liquidityUsd: 900, volumeH1: 7_000, transactionsH1: 18, buysH1: 17, sellsH1: 1, priceChangeM5: 20, priceChangeH1: 70, pairCreatedAt: Date.now() - 20 * 60_000 });
    expect(scored.riskScore).toBeGreaterThan(60);
    expect(scored.warnings).toContain("سيولة منخفضة جداً");
    expect(scored.warnings).toContain("حركة سعرية حادة");
  });

  it("applies liquidity, age, volume, and risk filters deterministically", () => {
    const safe = scoreCandidate(baseline);
    const risky = scoreCandidate({ ...baseline, baseAddress: "risky", liquidityUsd: 500, priceChangeH1: 90, pairCreatedAt: Date.now() - 10 * 60_000 });
    const result = applyFilters([safe, risky], { minLiquidity: 10_000, minVolume: 5_000, maxAgeHours: 48, maxRisk: 40 });
    expect(result).toHaveLength(1);
    expect(result[0]?.baseAddress).toBe("token");
  });
});
