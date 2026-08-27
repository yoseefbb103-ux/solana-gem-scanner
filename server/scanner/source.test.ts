import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJupiterPrices } from "./source";

const originalFetch = global.fetch;

afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

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
