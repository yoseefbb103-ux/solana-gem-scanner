import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const scannerDbMock = vi.hoisted(() => ({
  getLatestDashboard: vi.fn(),
  getPreviousScores: vi.fn(),
  getSavedFilters: vi.fn(),
  saveFilters: vi.fn(),
  storeScan: vi.fn(),
}));
const sourceMock = vi.hoisted(() => ({ fetchLatestSolanaCandidates: vi.fn() }));

vi.mock("../scannerDb", () => scannerDbMock);
vi.mock("../scanner/source", () => sourceMock);

import { scannerRouter } from "./scanner";

const context = { user: null, req: {}, res: {} } as TrpcContext;
const candidate = {
  pairAddress: "pair-1", baseAddress: "token-1", symbol: "TEST", name: "Test", dexId: "raydium", sourceUrl: "https://example.com",
  priceUsd: 0.04, liquidityUsd: 80_000, volumeH1: 11_000, volumeH24: 65_000, transactionsH1: 80, buysH1: 45, sellsH1: 35,
  priceChangeM5: 1.4, priceChangeH1: 8.5, pairCreatedAt: Date.now() - 4 * 3_600_000, ageHours: 4,
  opportunityScore: 61.5, riskScore: 12, scoreDelta: 2.5, factors: ["سيولة قابلة للتداول نسبياً"], warnings: [],
};

describe("scannerRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scannerDbMock.getPreviousScores.mockResolvedValue(new Map());
    scannerDbMock.storeScan.mockResolvedValue({ scanId: 7, persisted: true });
  });

  it("returns the latest stored dashboard snapshot", async () => {
    const dashboard = { scanId: 4, source: "DEX Screener public API", fetchedAt: new Date(), totalCandidates: 1, filters: {}, persistenceAvailable: true, candidates: [candidate] };
    scannerDbMock.getLatestDashboard.mockResolvedValue(dashboard);
    const result = await scannerRouter.createCaller(context).dashboard();
    expect(result).toEqual(dashboard);
  });

  it("saves and returns user-facing scanner filters", async () => {
    const filters = { minLiquidity: 5_000, minVolume: 1_000, maxAgeHours: 72, maxRisk: 45 };
    scannerDbMock.getSavedFilters.mockResolvedValue(filters);
    const caller = scannerRouter.createCaller(context);
    expect(await caller.filters.get()).toEqual({ filters });
    await expect(caller.filters.save(filters)).resolves.toEqual({ filters });
    expect(scannerDbMock.saveFilters).toHaveBeenCalledWith(filters);
  });

  it("filters, persists, and returns a successful manual refresh", async () => {
    sourceMock.fetchLatestSolanaCandidates.mockResolvedValue([candidate]);
    const filters = { minLiquidity: 20_000, minVolume: 5_000, maxAgeHours: 48, maxRisk: 30 };
    const result = await scannerRouter.createCaller(context).refresh(filters);
    expect(sourceMock.fetchLatestSolanaCandidates).toHaveBeenCalledWith(expect.any(Map));
    expect(scannerDbMock.storeScan).toHaveBeenCalledWith(expect.objectContaining({ status: "success", filters, candidates: [candidate] }));
    expect(result).toMatchObject({ scanId: 7, persistenceAvailable: true, totalCandidates: 1, candidates: [candidate] });
  });

  it("records a failed scan and surfaces a source error", async () => {
    sourceMock.fetchLatestSolanaCandidates.mockRejectedValue(new Error("المصدر غير متاح"));
    await expect(scannerRouter.createCaller(context).refresh()).rejects.toThrow("المصدر غير متاح");
    expect(scannerDbMock.storeScan).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorMessage: "المصدر غير متاح", candidates: [] }));
  });
});
