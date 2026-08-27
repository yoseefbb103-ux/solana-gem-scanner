import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEarlySolanaDiscovery, fetchJupiterPrices, fetchLatestSolanaMarket, resetSourceCache } from "./source";

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
        return { ok: true, status: 200, json: async () => [{ chainId: "solana", pairAddress: "pairA", baseToken: { address: "mintA", symbol: "TEST", name: "Test" }, info: { imageUrl: "https://cdn.example.com/test.png" }, dexId: "raydium", priceUsd: "0.1", liquidity: { usd: 10_000 }, volume: { h1: 1_000, h24: 2_000 }, txns: { h1: { buys: 3, sells: 2 } }, priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 }, pairCreatedAt: Date.now() }] };
      }
      return { ok: true, status: 200, json: async () => [{ chainId: "solana", tokenAddress: "mintA" }] };
    }) as typeof fetch;

    const [first, second] = await Promise.all([fetchLatestSolanaMarket(), fetchLatestSolanaMarket()]);
    const cached = await fetchLatestSolanaMarket();

    expect(first.candidates).toHaveLength(1);
    expect(second.candidates[0]?.baseAddress).toBe("mintA");
    expect(cached.candidates[0]?.baseAddress).toBe("mintA");
    expect(cached.candidates[0]?.imageUrl).toBe("https://cdn.example.com/test.png");
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it("يحد توازي جلب الأزواج حتى لا يضغط على المصدر العام", async () => {
    let activePairRequests = 0;
    let maxPairRequests = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("token-pairs")) {
        activePairRequests += 1;
        maxPairRequests = Math.max(maxPairRequests, activePairRequests);
        await new Promise((resolve) => setTimeout(resolve, 2));
        activePairRequests -= 1;
        const address = url.split("/").at(-1) ?? "mint";
        return { ok: true, status: 200, json: async () => [{ chainId: "solana", pairAddress: `pair-${address}`, baseToken: { address, symbol: address, name: address }, dexId: "raydium", priceUsd: "0.1", liquidity: { usd: 20_000 }, volume: { h1: 2_000, h24: 5_000 }, txns: { h1: { buys: 10, sells: 8 } }, priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 }, pairCreatedAt: Date.now() }] };
      }
      const offset = url.includes("recent-updates") ? 6 : url.includes("token-boosts/latest") ? 12 : url.includes("token-boosts/top") ? 18 : 0;
      return { ok: true, status: 200, json: async () => Array.from({ length: 6 }, (_, index) => ({ chainId: "solana", tokenAddress: `mint-${offset + index}` })) };
    }) as typeof fetch;
    const result = await fetchLatestSolanaMarket();
    expect(result.candidates).toHaveLength(24);
    expect(maxPairRequests).toBeLessThanOrEqual(8);
  });

  it("يرفض روابط الصور غير الآمنة القادمة من المصدر العام", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("token-pairs")) return { ok: true, status: 200, json: async () => [{ chainId: "solana", pairAddress: "pairA", baseToken: { address: "mintA", symbol: "TEST", name: "Test" }, info: { imageUrl: "http://insecure.example.com/test.png" }, dexId: "raydium", priceUsd: "0.1", liquidity: { usd: 10_000 }, volume: { h1: 1_000, h24: 2_000 }, txns: { h1: { buys: 3, sells: 2 } }, priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 }, pairCreatedAt: Date.now() }] };
      return { ok: true, status: 200, json: async () => [{ chainId: "solana", tokenAddress: "mintA" }] };
    }) as typeof fetch;
    const result = await fetchLatestSolanaMarket();
    expect(result.candidates[0]?.imageUrl).toBeNull();
  });

  it("يجمع طلبات الرصد المبكر المتزامنة ويحتفظ فقط بالزوج ذي السيولة الأولية", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("token-pairs")) {
        return { ok: true, status: 200, json: async () => [
          { chainId: "solana", pairAddress: "pairA", baseToken: { address: "mintA", symbol: "EARLY", name: "Early" }, dexId: "raydium", priceUsd: "0.1", liquidity: { usd: 2_000 }, volume: { h1: 10, h24: 10 }, txns: { h1: { buys: 1, sells: 0 } }, priceChange: { m5: 0, h1: 0, h6: 0, h24: 0 }, pairCreatedAt: Date.now() },
          { chainId: "solana", pairAddress: "pairLow", baseToken: { address: "mintA", symbol: "EARLY", name: "Early" }, dexId: "raydium", priceUsd: "0.1", liquidity: { usd: 500 }, volume: { h1: 1, h24: 1 }, txns: { h1: { buys: 0, sells: 0 } }, priceChange: { m5: 0, h1: 0, h6: 0, h24: 0 }, pairCreatedAt: Date.now() },
        ] };
      }
      return { ok: true, status: 200, json: async () => [{ chainId: "solana", tokenAddress: "mintA" }] };
    }) as typeof fetch;

    const [first, second] = await Promise.all([fetchEarlySolanaDiscovery(), fetchEarlySolanaDiscovery()]);
    const cached = await fetchEarlySolanaDiscovery();

    expect(first.candidates).toHaveLength(1);
    expect(second.candidates[0]?.liquidityUsd).toBe(2_000);
    expect(cached.candidates[0]?.discoverySources).toEqual(["رصد مبكر: ملفات حديثة"]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
