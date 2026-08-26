import { desc, eq } from "drizzle-orm";
import { filterSettings, scannerSnapshots, scanRuns } from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_FILTERS, type ScanFilters, type ScoredCandidate } from "./scanner/types";

type StoreScanInput = {
  source: string;
  status: "success" | "partial" | "failed";
  filters: ScanFilters;
  candidates: ScoredCandidate[];
  fetchedAt: Date;
  errorMessage?: string;
};

const parseFilters = (value?: string | null): ScanFilters => {
  try {
    return { ...DEFAULT_FILTERS, ...(value ? JSON.parse(value) : {}) };
  } catch {
    return DEFAULT_FILTERS;
  }
};

const parseJsonArray = (value: string) => {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [] as string[];
  }
};

export async function getPreviousScores() {
  const db = await getDb();
  const scores = new Map<string, number>();
  if (!db) return scores;
  const rows = await db.select({ baseAddress: scannerSnapshots.baseAddress, opportunityScore: scannerSnapshots.opportunityScore })
    .from(scannerSnapshots)
    .orderBy(desc(scannerSnapshots.fetchedAt))
    .limit(500);
  for (const row of rows) if (!scores.has(row.baseAddress)) scores.set(row.baseAddress, Number(row.opportunityScore));
  return scores;
}

export async function storeScan(input: StoreScanInput) {
  const db = await getDb();
  if (!db) {
    console.warn("[Scanner] Scan completed without persistence because the database is unavailable.");
    return { scanId: null, persisted: false };
  }
  const result = await db.insert(scanRuns).values({
    source: input.source,
    status: input.status,
    candidateCount: input.candidates.length,
    filterJson: JSON.stringify(input.filters),
    errorMessage: input.errorMessage ?? null,
    fetchedAt: input.fetchedAt,
  });
  const insertHeader = Array.isArray(result)
    ? result[0]
    : result;
  const scanId = Number((insertHeader as { insertId?: number } | undefined)?.insertId ?? 0);
  if (scanId && input.candidates.length) {
    await db.insert(scannerSnapshots).values(input.candidates.map((candidate) => ({
      scanRunId: scanId,
      pairAddress: candidate.pairAddress,
      baseAddress: candidate.baseAddress,
      symbol: candidate.symbol,
      name: candidate.name,
      dexId: candidate.dexId,
      sourceUrl: candidate.sourceUrl,
      priceUsd: candidate.priceUsd,
      liquidityUsd: candidate.liquidityUsd,
      volumeH1: candidate.volumeH1,
      volumeH24: candidate.volumeH24,
      transactionsH1: candidate.transactionsH1,
      priceChangeM5: candidate.priceChangeM5,
      priceChangeH1: candidate.priceChangeH1,
      pairCreatedAt: candidate.pairCreatedAt ? new Date(candidate.pairCreatedAt) : null,
      opportunityScore: candidate.opportunityScore,
      riskScore: candidate.riskScore,
      scoreDelta: candidate.scoreDelta,
      factorsJson: JSON.stringify(candidate.factors),
      warningsJson: JSON.stringify(candidate.warnings),
      fetchedAt: input.fetchedAt,
    })));
  }
  return { scanId: scanId || null, persisted: Boolean(scanId) };
}

export async function getLatestDashboard() {
  const db = await getDb();
  if (!db) return null;
  const [run] = await db.select().from(scanRuns).orderBy(desc(scanRuns.fetchedAt)).limit(1);
  if (!run || run.status === "failed") return null;
  const rows = await db.select().from(scannerSnapshots).where(eq(scannerSnapshots.scanRunId, run.id)).orderBy(desc(scannerSnapshots.opportunityScore));
  return {
    scanId: run.id,
    source: run.source,
    fetchedAt: run.fetchedAt,
    totalCandidates: run.candidateCount,
    filters: parseFilters(run.filterJson),
    persistenceAvailable: true,
    candidates: rows.map((row) => ({
      pairAddress: row.pairAddress,
      baseAddress: row.baseAddress,
      symbol: row.symbol,
      name: row.name,
      dexId: row.dexId,
      sourceUrl: row.sourceUrl,
      priceUsd: row.priceUsd === null ? null : Number(row.priceUsd),
      liquidityUsd: Number(row.liquidityUsd),
      volumeH1: Number(row.volumeH1),
      volumeH24: Number(row.volumeH24),
      transactionsH1: row.transactionsH1,
      buysH1: 0,
      sellsH1: 0,
      priceChangeM5: Number(row.priceChangeM5),
      priceChangeH1: Number(row.priceChangeH1),
      pairCreatedAt: row.pairCreatedAt?.getTime() ?? null,
      ageHours: row.pairCreatedAt ? Math.round(((Date.now() - row.pairCreatedAt.getTime()) / 3_600_000) * 10) / 10 : null,
      opportunityScore: Number(row.opportunityScore),
      riskScore: Number(row.riskScore),
      scoreDelta: Number(row.scoreDelta),
      factors: parseJsonArray(row.factorsJson),
      warnings: parseJsonArray(row.warningsJson),
    })),
  };
}

export async function getSavedFilters() {
  const db = await getDb();
  if (!db) return DEFAULT_FILTERS;
  const [setting] = await db.select().from(filterSettings).where(eq(filterSettings.scopeKey, "public-dashboard")).limit(1);
  return parseFilters(setting?.settingsJson);
}

export async function saveFilters(filters: ScanFilters) {
  const db = await getDb();
  if (!db) return;
  await db.insert(filterSettings).values({ scopeKey: "public-dashboard", settingsJson: JSON.stringify(filters) })
    .onDuplicateKeyUpdate({ set: { settingsJson: JSON.stringify(filters), updatedAt: new Date() } });
}
