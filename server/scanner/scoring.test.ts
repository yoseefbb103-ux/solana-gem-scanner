import { describe, expect, it } from "vitest";
import { applyFilters, scoreCandidate, unavailableSecurity } from "./scoring";
import type { TokenCandidate } from "./types";

const baseline: TokenCandidate = {
  pairAddress: "pair", baseAddress: "token", symbol: "TEST", name: "Test Token", dexId: "raydium", sourceUrl: "https://example.com",
  priceUsd: 0.01, liquidityUsd: 75_000, volumeH1: 20_000, volumeH24: 120_000, transactionsH1: 130, buysH1: 75, sellsH1: 55,
  priceChangeM5: 3, priceChangeH1: 12, priceChangeH6: 8, priceChangeH24: 4, pairCreatedAt: Date.now() - 5 * 3_600_000,
  discoverySources: ["ملفات حديثة"], liquidDexCount: 1, metadataCompleteness: 0,
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

  it("forces avoid and a critical warning when liquidity falls sharply between scans", () => {
    const scored = scoreCandidate(baseline, undefined, undefined, { liquidityDeltaPct: -48, liquidityPullDetected: true });
    expect(scored.decision).toBe("avoid");
    expect(scored.riskScore).toBeGreaterThanOrEqual(65);
    expect(scored.warnings.some((warning) => warning.includes("سحب سيولة"))).toBe(true);
  });

  it("adds a manual-review warning when Jupiter materially differs from DEX price", () => {
    const scored = scoreCandidate(baseline, undefined, undefined, { jupiterChecked: true, jupiterPriceUsd: 0.02 });
    expect(scored.priceDivergencePct).toBe(50);
    expect(scored.warnings.some((warning) => warning.includes("تعارض في السعر"))).toBe(true);
  });

  it("treats known rugged deployers and rapid spray patterns as explicit risk", () => {
    const flaggedSecurity = { ...unavailableSecurity(baseline), status: "passed" as const, knownRuggedDeployer: true, sprayCount24h: 3, flags: ["الناشر مرتبط برَقّ سابق"] };
    const scored = scoreCandidate(baseline, undefined, flaggedSecurity);
    expect(scored.decision).toBe("avoid");
    expect(scored.riskScore).toBeGreaterThanOrEqual(50);
    expect(scored.warnings.some((warning) => warning.includes("نمط رش"))).toBe(true);
  });

  it("raises transparent risk for observed on-chain clustering, bundling, and shared funding", () => {
    const observed = { ...unavailableSecurity(baseline), status: "passed" as const, holderClusterScore: 60, bundleDetected: true, fundingSourceOverlap: true, token2022Flags: ["Transfer Hook مرصود"] };
    const scored = scoreCandidate(baseline, undefined, observed);
    expect(scored.riskScore).toBeGreaterThanOrEqual(45);
    expect(scored.warnings.some((warning) => warning.includes("تمويل مشترك"))).toBe(true);
    expect(scored.warnings.some((warning) => warning.includes("Token-2022"))).toBe(true);
  });
});
