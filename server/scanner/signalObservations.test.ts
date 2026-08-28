import { describe, expect, it } from "vitest";
import { createSignalObservation, SIGNAL_REASON_CODES, SIGNAL_REASON_LABELS } from "./signalObservations";

const baseObservation = {
  baseAddress: "Token111111111111111111111111111111111111111",
  pairAddress: "Pair111111111111111111111111111111111111111",
  stage: "early" as const,
  signalKey: "liquidity_to_market_cap",
  reasonCode: SIGNAL_REASON_CODES.LIQUIDITY_TO_MARKET_CAP_AVAILABLE,
  effect: "score_deduction" as const,
  availability: "available" as const,
  evidenceState: "unknown" as const,
  value: 0.12,
  source: "DEX Screener",
  observedAt: new Date("2026-08-28T00:00:00.000Z"),
  requestCost: 0,
};

describe("signal observations contract", () => {
  it("keeps reason codes stable and Arabic-displayable", () => {
    expect(SIGNAL_REASON_CODES.LIQUIDITY_TO_MARKET_CAP_AVAILABLE).toBe("liquidity_to_market_cap.available");
    expect(SIGNAL_REASON_LABELS[SIGNAL_REASON_CODES.LIQUIDITY_TO_MARKET_CAP_AVAILABLE]).toContain("متاحة");
  });

  it("keeps hard gates separate from score deductions", () => {
    const hardGate = createSignalObservation({ ...baseObservation, effect: "hard_gate" });
    const deduction = createSignalObservation({ ...baseObservation, effect: "score_deduction" });
    expect(hardGate.effect).toBe("hard_gate");
    expect(deduction.effect).toBe("score_deduction");
    expect(hardGate.effect).not.toBe(deduction.effect);
  });

  it("keeps unknown distinct from safe", () => {
    const unknown = createSignalObservation(baseObservation);
    const safe = createSignalObservation({ ...baseObservation, evidenceState: "safe" });
    expect(unknown.evidenceState).toBe("unknown");
    expect(safe.evidenceState).toBe("safe");
    expect(unknown.evidenceState).not.toBe(safe.evidenceState);
  });

  it("requires unavailable evidence when the source is unavailable", () => {
    expect(() => createSignalObservation({ ...baseObservation, availability: "unavailable", evidenceState: "unknown" })).toThrow("evidenceState=unavailable");
    expect(createSignalObservation({ ...baseObservation, availability: "unavailable", evidenceState: "unavailable", value: null, reasonCode: SIGNAL_REASON_CODES.LIQUIDITY_TO_MARKET_CAP_UNAVAILABLE })).toMatchObject({ availability: "unavailable", evidenceState: "unavailable" });
  });

  it("rejects negative request cost and missing observation metadata", () => {
    expect(() => createSignalObservation({ ...baseObservation, requestCost: -1 })).toThrow("requestCost");
    expect(() => createSignalObservation({ ...baseObservation, reasonCode: "" })).toThrow("reasonCode");
    expect(() => createSignalObservation({ ...baseObservation, observedAt: undefined })).toThrow("observedAt");
  });
});
