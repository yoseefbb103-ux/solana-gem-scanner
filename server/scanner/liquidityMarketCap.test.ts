import { describe, expect, it } from "vitest";
import { calculateLiquidityToMarketCapSignal } from "./scoring";

describe("liquidity to market cap signal", () => {
  it("calculates a bounded ratio and deduction for valid values", () => {
    expect(calculateLiquidityToMarketCapSignal(10_000, 500_000)).toEqual({ ratio: 0.02, deduction: 0 });
    expect(calculateLiquidityToMarketCapSignal(5_000, 1_000_000)).toEqual({ ratio: 0.005, deduction: 4.5 });
  });

  it("returns unavailable when market cap is missing or invalid", () => {
    for (const marketCap of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(calculateLiquidityToMarketCapSignal(10_000, marketCap)).toEqual({ ratio: null, deduction: 0 });
    }
  });

  it("does not create invalid output for anomalous liquidity values", () => {
    expect(calculateLiquidityToMarketCapSignal(Number.NaN, 100_000)).toEqual({ ratio: null, deduction: 0 });
    expect(calculateLiquidityToMarketCapSignal(Number.POSITIVE_INFINITY, 100_000)).toEqual({ ratio: null, deduction: 0 });
    expect(calculateLiquidityToMarketCapSignal(-100, 100_000)).toEqual({ ratio: null, deduction: 0 });
    expect(calculateLiquidityToMarketCapSignal(0, 100_000)).toEqual({ ratio: 0, deduction: 6 });
  });

  it("caps the deduction and never acts as a hard gate", () => {
    const result = calculateLiquidityToMarketCapSignal(1, 1_000_000_000);
    expect(result.deduction).toBe(6);
    expect(result.deduction).toBeGreaterThanOrEqual(0);
    expect(result.deduction).toBeLessThanOrEqual(6);
  });
});
