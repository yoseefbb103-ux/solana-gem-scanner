import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { addToWatchlist, getLatestDashboard, getPerformanceReport, getRecentAlerts, getSavedFilters, getScannerSettings, getSourceHealthSummary, listEarlyWatches, listWatchlist, removeFromWatchlist, saveFilters, saveScannerSettings } from "../scannerDb";
import { runScanner } from "../scanner/scanService";
import { DEFAULT_FILTERS, DEFAULT_SCANNER_SETTINGS, type ScanFilters } from "../scanner/types";

const filtersSchema = z.object({ minLiquidity: z.number().min(0).max(10_000_000), minVolume: z.number().min(0).max(10_000_000), maxAgeHours: z.number().min(1).max(720), maxRisk: z.number().min(0).max(100) });
const settingsSchema = z.object({ strictSecurity: z.boolean(), opportunityAlertThreshold: z.number().min(0).max(100), riskAlertThreshold: z.number().min(0).max(100), cooldownMinutes: z.number().min(10).max(1440), deepScanLimit: z.number().int().min(1).max(10) });
const watchInput = z.object({ baseAddress: z.string().min(20).max(80), pairAddress: z.string().min(20).max(80), symbol: z.string().min(1).max(64), name: z.string().min(1).max(160), sourceUrl: z.string().url() });

const normalizeFilters = (filters?: Partial<ScanFilters>): ScanFilters => ({ ...DEFAULT_FILTERS, ...filters });

export const scannerRouter = router({
  dashboard: publicProcedure.query(async () => getLatestDashboard()),
  refresh: publicProcedure.input(filtersSchema.optional()).mutation(async ({ input }) => runScanner({ origin: "manual", filters: normalizeFilters(input) })),
  filters: router({
    get: publicProcedure.query(async () => ({ filters: await getSavedFilters() })),
    save: publicProcedure.input(filtersSchema).mutation(async ({ input }) => { await saveFilters(input); return { filters: input }; }),
  }),
  settings: router({
    get: publicProcedure.query(async () => ({ settings: await getScannerSettings() })),
    save: publicProcedure.input(settingsSchema).mutation(async ({ input }) => { await saveScannerSettings(input); return { settings: input }; }),
    defaults: publicProcedure.query(() => DEFAULT_SCANNER_SETTINGS),
  }),
  watchlist: router({
    list: publicProcedure.query(async () => listWatchlist()),
    add: publicProcedure.input(watchInput).mutation(async ({ input }) => ({ saved: await addToWatchlist(input) })),
    remove: publicProcedure.input(z.object({ baseAddress: z.string().min(20).max(80) })).mutation(async ({ input }) => ({ removed: await removeFromWatchlist(input.baseAddress) })),
  }),
  health: publicProcedure.query(async () => ({ events: await getSourceHealthSummary() })),
  alerts: publicProcedure.query(async () => ({ events: await getRecentAlerts() })),
  earlyWatches: publicProcedure.query(async () => ({ watches: await listEarlyWatches() })),
  performance: publicProcedure.query(async () => getPerformanceReport()),
});
