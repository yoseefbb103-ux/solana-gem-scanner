import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const dbMock = vi.hoisted(() => ({
  addToWatchlist: vi.fn(), getLatestDashboard: vi.fn(), getPerformanceReport: vi.fn(), getRecentAlerts: vi.fn(), getSavedFilters: vi.fn(),
  getScannerSettings: vi.fn(), getSourceHealthSummary: vi.fn(), listWatchlist: vi.fn(), removeFromWatchlist: vi.fn(), saveFilters: vi.fn(), saveScannerSettings: vi.fn(),
}));
const scannerMock = vi.hoisted(() => ({ runScanner: vi.fn() }));

vi.mock("../scannerDb", () => dbMock);
vi.mock("../scanner/scanService", () => scannerMock);

import { scannerRouter } from "./scanner";

const context = { user: null, req: {}, res: {} } as TrpcContext;
const filters = { minLiquidity: 5_000, minVolume: 1_000, maxAgeHours: 72, maxRisk: 45 };
const settings = { strictSecurity: true, opportunityAlertThreshold: 72, riskAlertThreshold: 28, cooldownMinutes: 120, deepScanLimit: 8 };

describe("scannerRouter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored dashboard snapshot", async () => {
    const dashboard = { scanId: 4, source: "DEX Screener public API + RugCheck", fetchedAt: new Date(), totalCandidates: 1, filters, persistenceAvailable: true, candidates: [] };
    dbMock.getLatestDashboard.mockResolvedValue(dashboard);
    await expect(scannerRouter.createCaller(context).dashboard()).resolves.toEqual(dashboard);
  });

  it("runs an explicit manual refresh using normalized filters", async () => {
    const response = { scanId: 9, candidates: [], filters, persistenceAvailable: true };
    scannerMock.runScanner.mockResolvedValue(response);
    await expect(scannerRouter.createCaller(context).refresh(filters)).resolves.toEqual(response);
    expect(scannerMock.runScanner).toHaveBeenCalledWith({ origin: "manual", filters });
  });

  it("saves settings and filters independently", async () => {
    const caller = scannerRouter.createCaller(context);
    await expect(caller.filters.save(filters)).resolves.toEqual({ filters });
    await expect(caller.settings.save(settings)).resolves.toEqual({ settings });
    expect(dbMock.saveFilters).toHaveBeenCalledWith(filters);
    expect(dbMock.saveScannerSettings).toHaveBeenCalledWith(settings);
  });

  it("persists a watchlist item without a wallet operation", async () => {
    dbMock.addToWatchlist.mockResolvedValue(true);
    const item = { baseAddress: "A".repeat(32), pairAddress: "B".repeat(32), symbol: "TEST", name: "Test token", sourceUrl: "https://dexscreener.com/solana/pair" };
    await expect(scannerRouter.createCaller(context).watchlist.add(item)).resolves.toEqual({ saved: true });
    expect(dbMock.addToWatchlist).toHaveBeenCalledWith(item);
  });
});
