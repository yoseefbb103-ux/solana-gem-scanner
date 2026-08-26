import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { applyFilters } from "../scanner/scoring";
import { fetchLatestSolanaCandidates } from "../scanner/source";
import { DEFAULT_FILTERS, type ScanFilters } from "../scanner/types";
import { getLatestDashboard, getPreviousScores, getSavedFilters, saveFilters, storeScan } from "../scannerDb";

const filtersSchema = z.object({
  minLiquidity: z.number().min(0).max(10_000_000),
  minVolume: z.number().min(0).max(10_000_000),
  maxAgeHours: z.number().min(1).max(720),
  maxRisk: z.number().min(0).max(100),
});

const normalizeFilters = (filters?: Partial<ScanFilters>): ScanFilters => ({ ...DEFAULT_FILTERS, ...filters });

export const scannerRouter = router({
  dashboard: publicProcedure.query(async () => getLatestDashboard()),
  refresh: publicProcedure.input(filtersSchema.optional()).mutation(async ({ input }) => {
    const filters = normalizeFilters(input);
    const startedAt = new Date();
    try {
      const previousScores = await getPreviousScores();
      const candidates = await fetchLatestSolanaCandidates(previousScores);
      const visibleCandidates = applyFilters(candidates, filters);
      const stored = await storeScan({
        source: "DEX Screener public API",
        status: candidates.length === 0 ? "partial" : "success",
        filters,
        candidates,
        fetchedAt: startedAt,
      });
      return {
        scanId: stored.scanId,
        source: "DEX Screener public API",
        fetchedAt: startedAt,
        totalCandidates: candidates.length,
        candidates: visibleCandidates,
        filters,
        persistenceAvailable: stored.persisted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل تحديث المصدر";
      await storeScan({ source: "DEX Screener public API", status: "failed", filters, candidates: [], fetchedAt: startedAt, errorMessage: message });
      throw new Error(message);
    }
  }),
  filters: router({
    get: publicProcedure.query(async () => ({ filters: await getSavedFilters() })),
    save: publicProcedure.input(filtersSchema).mutation(async ({ input }) => {
      await saveFilters(input);
      return { filters: input };
    }),
  }),
});
