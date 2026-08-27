import { describe, expect, it } from "vitest";
import { excludePromotedFromThreshold, selectConfirmedCandidates } from "./scanService";
import type { ScoredCandidate } from "./types";

function candidate(overrides: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    pairAddress: "pair", baseAddress: "mint", symbol: "TEST", name: "Test", dexId: "raydium", sourceUrl: "https://dexscreener.com/solana/pair",
    priceUsd: 0.1, liquidityUsd: 20_000, volumeH1: 10_000, volumeH24: 20_000, transactionsH1: 40, buysH1: 24, sellsH1: 16,
    priceChangeM5: 2, priceChangeH1: 4, priceChangeH6: 5, priceChangeH24: 3, pairCreatedAt: Date.now(), ageHours: 1,
    opportunityScore: 78, riskScore: 20, scoreDelta: 0, factors: [], warnings: [], decision: "monitor",
    estimatedSlippage200: 1, estimatedSlippage500: 2, momentumConsistency: "positive", jupiterPriceUsd: 0.1, priceDivergencePct: 4,
    liquidityDeltaPct: 2, liquidityPullDetected: false, liquidityGrowthStable: false, liquidDexCount: 1, metadataCompleteness: 2,
    discoverySources: ["رصد مبكر: ملفات حديثة"],
    security: { baseAddress: "mint", pairAddress: "pair", symbol: "TEST", source: "RugCheck", status: "passed", mintAuthorityOpen: false, freezeAuthorityOpen: false, lpLockStatus: "locked", holderTopPct: 10, holderTop10Pct: 30, creatorAddress: null, ruggedCreator: false, rugcheckScore: 0, symbolConflict: false, deepScanApplied: true, flags: [], checkedAt: Date.now() },
    ...overrides,
  } as ScoredCandidate;
}

describe("confirmed alert gates", () => {
  it("يرقي فقط المرشح الذي يمر بالأمان والسيولة وسعر Jupiter وفرق السعر", () => {
    const qualified = candidate();
    const missingPrice = candidate({ baseAddress: "no-price", jupiterPriceUsd: null });
    const divergent = candidate({ baseAddress: "divergent", priceDivergencePct: 13 });
    const pull = candidate({ baseAddress: "pull", liquidityPullDetected: true });

    expect(selectConfirmedCandidates([qualified, missingPrice, divergent, pull])).toEqual([qualified]);
  });

  it("يستبعد المرشح المرقّى من مجموعة تنبيه threshold كي لا تتكرر الرسالة", () => {
    const confirmed = candidate();
    const ordinary = candidate({ baseAddress: "ordinary", symbol: "OTHER" });

    expect(excludePromotedFromThreshold([confirmed, ordinary], [confirmed])).toEqual([ordinary]);
  });
});
