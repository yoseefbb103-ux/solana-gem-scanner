import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSecurityReport, requiresStrictExclusion } from "./security";

const candidate = { pairAddress: "pair", baseAddress: "mint", symbol: "TEST", name: "Test", dexId: "raydium", sourceUrl: "https://dexscreener.com/solana/pair", priceUsd: 0.1, liquidityUsd: 20_000, volumeH1: 3_000, volumeH24: 20_000, transactionsH1: 25, buysH1: 15, sellsH1: 10, priceChangeM5: 2, priceChangeH1: 4, priceChangeH6: 3, priceChangeH24: 2, pairCreatedAt: Date.now() };

describe("RugCheck security enrichment", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("flags open mint authority and unlocked liquidity for strict exclusion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ creator: "creator", rugged: false, score: 11, token: { mintAuthority: "authority", freezeAuthority: null }, topHolders: [{ pct: 30 }, { pct: 20 }], markets: [{ lp: { isLocked: false } }], risks: [{ level: "high", name: "High risk flag" }] }) }));
    const report = await fetchSecurityReport(candidate, true, true);
    expect(report.status).toBe("flagged");
    expect(report.mintAuthorityOpen).toBe(true);
    expect(report.lpLockStatus).toBe("unlocked");
    expect(report.symbolConflict).toBe(true);
    expect(report.holderTop10Pct).toBe(50);
    expect(requiresStrictExclusion(report)).toBe(true);
  });
  it("returns an unavailable status instead of assuming a pass when the source fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const report = await fetchSecurityReport(candidate, false, false);
    expect(report.status).toBe("unavailable");
    expect(report.flags.join(" ")).toContain("بيانات أمان غير متاحة");
  });
});
