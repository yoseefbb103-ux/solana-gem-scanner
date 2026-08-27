import type { DexScreenerPair, MarketFetchResult, SourceTelemetry, TokenCandidate } from "./types";

type TokenProfile = { chainId?: string; tokenAddress?: string; url?: string };

const API_BASE = "https://api.dexscreener.com";

async function dexFetch<T>(path: string, telemetry: SourceTelemetry): Promise<T> {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(10_000) });
    const latency = Date.now() - startedAt;
    telemetry.requestCount += 1;
    telemetry.latestStatus = response.status;
    telemetry.maxLatencyMs = Math.max(telemetry.maxLatencyMs, latency);
    if (response.status === 429) telemetry.throttled = true;
    if (latency >= 4_000) telemetry.slowRequestCount += 1;
    if (!response.ok) {
      telemetry.errorCount += 1;
      throw new Error(`تعذر جلب بيانات المصدر (${response.status})`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    telemetry.errorCount += 1;
    throw error;
  }
}

function toCandidate(pair: DexScreenerPair, fallbackUrl?: string): TokenCandidate | null {
  const baseAddress = pair.baseToken?.address;
  const pairAddress = pair.pairAddress;
  if (!baseAddress || !pairAddress) return null;
  const h1Tx = pair.txns?.h1 ?? {};
  const buysH1 = Number(h1Tx.buys ?? 0);
  const sellsH1 = Number(h1Tx.sells ?? 0);
  const price = Number(pair.priceUsd);
  return {
    pairAddress,
    baseAddress,
    symbol: pair.baseToken?.symbol || "?",
    name: pair.baseToken?.name || pair.baseToken?.symbol || "توكن غير مسمى",
    dexId: pair.dexId || "غير معروف",
    sourceUrl: pair.url || fallbackUrl || `https://dexscreener.com/solana/${pairAddress}`,
    priceUsd: Number.isFinite(price) ? price : null,
    liquidityUsd: Number(pair.liquidity?.usd ?? 0),
    volumeH1: Number(pair.volume?.h1 ?? 0),
    volumeH24: Number(pair.volume?.h24 ?? 0),
    transactionsH1: buysH1 + sellsH1,
    buysH1,
    sellsH1,
    priceChangeM5: Number(pair.priceChange?.m5 ?? 0),
    priceChangeH1: Number(pair.priceChange?.h1 ?? 0),
    priceChangeH6: Number(pair.priceChange?.h6 ?? 0),
    priceChangeH24: Number(pair.priceChange?.h24 ?? 0),
    pairCreatedAt: typeof pair.pairCreatedAt === "number" ? pair.pairCreatedAt : null,
  };
}

export async function fetchLatestSolanaMarket(): Promise<MarketFetchResult> {
  const telemetry: SourceTelemetry = { source: "DEX Screener", requestCount: 0, throttled: false, slowRequestCount: 0, errorCount: 0, latestStatus: null, maxLatencyMs: 0, capturedAt: Date.now() };
  const profiles = await dexFetch<TokenProfile[]>("/token-profiles/latest/v1", telemetry);
  const solanaProfiles = profiles
    .filter((profile) => profile.chainId === "solana" && profile.tokenAddress)
    .filter((profile, index, all) => all.findIndex((item) => item.tokenAddress === profile.tokenAddress) === index)
    .slice(0, 20);

  const pairGroups = await Promise.all(solanaProfiles.map(async (profile) => {
    try {
      const pairs = await dexFetch<DexScreenerPair[]>(`/token-pairs/v1/solana/${profile.tokenAddress}`, telemetry);
      return { profile, pairs };
    } catch {
      return { profile, pairs: [] as DexScreenerPair[] };
    }
  }));

  const byAddress = new Map<string, TokenCandidate>();
  for (const { profile, pairs } of pairGroups) {
    const bestPair = pairs
      .filter((pair) => pair.chainId === "solana" && pair.pairAddress)
      .sort((left, right) => Number(right.liquidity?.usd ?? 0) - Number(left.liquidity?.usd ?? 0))[0];
    if (!bestPair) continue;
    const candidate = toCandidate(bestPair, profile.url);
    if (!candidate) continue;
    const existing = byAddress.get(candidate.baseAddress);
    if (!existing || candidate.liquidityUsd > existing.liquidityUsd) byAddress.set(candidate.baseAddress, candidate);
  }

  return { candidates: Array.from(byAddress.values()).sort((left, right) => right.liquidityUsd - left.liquidityUsd), telemetry };
}

export async function fetchLatestSolanaCandidates() {
  const result = await fetchLatestSolanaMarket();
  return result.candidates;
}

export async function fetchTokenPriceUsd(baseAddress: string): Promise<number | null> {
  const telemetry: SourceTelemetry = { source: "DEX Screener", requestCount: 0, throttled: false, slowRequestCount: 0, errorCount: 0, latestStatus: null, maxLatencyMs: 0, capturedAt: Date.now() };
  const pairs = await dexFetch<DexScreenerPair[]>(`/token-pairs/v1/solana/${baseAddress}`, telemetry);
  const best = pairs.filter((pair) => pair.chainId === "solana" && pair.priceUsd).sort((left, right) => Number(right.liquidity?.usd ?? 0) - Number(left.liquidity?.usd ?? 0))[0];
  return best?.priceUsd ? Number(best.priceUsd) : null;
}
