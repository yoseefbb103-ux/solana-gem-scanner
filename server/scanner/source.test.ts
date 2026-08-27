import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJupiterPrices, fetchLatestSolanaMarket, resetSourceCache } from "./source";

const originalFetch = global.fetch;

afterEach(() => { global.fetch = originalFetch; resetSourceCache(); vi.restoreAllMocks(); });

describe("Jupiter price comparison", () => {
  it("keeps only valid USD prices and marks omitted mints unavailable", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ mintA: { usdPrice: 1.25 }, mintB: { usdPrice: 0 } }) }) as typeof fetch;
    const result = await fetchJupiterPrices(["mintA", "mintB", "mintC"]);
    expect(result.prices.get("mintA")).toBe(1.25);
    expect(result.unavailableAddresses).toEqual(new Set(["mintB", "mintC"]));
  });

  it("fails gracefully when the public price source rejects a request", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 }) as typeof fetch;
    const result = await fetchJupiterPrices(["mintA"]);
    expect(result.prices.size).toBe(0);
    expect(result.unavailableAddresses.has("mintA")).toBe(true);
    expect(result.status).toBe(429);
  });
});

describe("DEX Screener market cache", () => {
  it("shares one in-flight market request and reuses the completed result briefly", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("token-pairs")) {
        return { ok: true, status: 200, json: async () => [{ chainId: "solana", pairAddress: "pairA", baseToken: { address: "mintA", symbol: "TEST", name: "Test" }, dexId: "raydium", priceUsd: "0.1", liquidity: { usd: 10_000 }, volume: { h1: 1_000, h24: 2_000 }, txns: { h1: { buys: 3, sells: 2 } }, priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 }, pairCreatedAt: Date.now() }] };
      }
      return { ok: true, status: 200, json: async () => [{ chainId: "solana", tokenAddress: "mintA" }] };
    }) as typeof fetch;

    const [first, second] = await Promise.all([fetchLatestSolanaMarket(), fetchLatestSolanaMarket()]);
    const cached = await fetchLatestSolanaMarket();

    expect(first.candidates).toHaveLength(1);
    expect(second.candidates[0]?.baseAddress).toBe("mintA");
    expect(cached.candidates[0]?.baseAddress).toBe("mintA");
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });
});
