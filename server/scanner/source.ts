import type { DexScreenerPair, MarketFetchResult, SourceTelemetry, TokenCandidate } from "./types";

type TokenProfile = { chainId?: string; tokenAddress?: string; url?: string; icon?: string | null; description?: string | null; links?: { type?: string; label?: string; url?: string }[] | null };
type ProfileWithSource = TokenProfile & { sources: Set<string> };
type JupiterTokenPrice = { usdPrice?: number };
export type JupiterPrices = { prices: Map<string, number>; unavailableAddresses: Set<string>; status: number | null };

const API_BASE = "https://api.dexscreener.com";
const JUPITER_PRICE_URL = "https://api.jup.ag/price/v3";
const MARKET_CACHE_TTL_MS = 45_000;
const EARLY_DISCOVERY_CACHE_TTL_MS = 15_000;
const EARLY_DISCOVERY_PROFILE_LIMIT = 12;
const EARLY_DISCOVERY_MIN_LIQUIDITY_USD = 1_000;
const DISCOVERY_PATHS = [
  { path: "/token-profiles/latest/v1", source: "ملفات حديثة" },
  { path: "/token-profiles/recent-updates/v1", source: "ملفات محدّثة" },
  { path: "/token-boosts/latest/v1", source: "تعزيزات حديثة" },
  { path: "/token-boosts/top/v1", source: "تعزيزات بارزة" },
] as const;

let cachedMarket: { value: MarketFetchResult; expiresAt: number } | null = null;
let pendingMarketFetch: Promise<MarketFetchResult> | null = null;
let cachedEarlyDiscovery: { value: MarketFetchResult; expiresAt: number } | null = null;
let pendingEarlyDiscovery: Promise<MarketFetchResult> | null = null;

export function resetSourceCache() {
  cachedMarket = null;
  pendingMarketFetch = null;
  cachedEarlyDiscovery = null;
  pendingEarlyDiscovery = null;
}

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
    if (!response.ok) throw new Error(`تعذر جلب بيانات المصدر (${response.status})`);
    return response.json() as Promise<T>;
  } catch (error) {
    telemetry.errorCount += 1;
    throw error;
  }
}

function metadataScore(pair: DexScreenerPair, profile?: TokenProfile) {
  return Number(Boolean(pair.info?.imageUrl || profile?.icon)) + Number(Boolean(pair.info?.websites?.length || profile?.links?.some((link) => link.type === "website"))) + Number(Boolean(pair.info?.socials?.length || profile?.links?.some((link) => link.type && link.type !== "website")));
}

function safeImageUrl(pair: DexScreenerPair, profile?: TokenProfile) {
  const candidate = pair.info?.imageUrl || profile?.icon;
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function toCandidate(pair: DexScreenerPair, pairs: DexScreenerPair[], profile: ProfileWithSource): TokenCandidate | null {
  const baseAddress = pair.baseToken?.address;
  const pairAddress = pair.pairAddress;
  if (!baseAddress || !pairAddress) return null;
  const h1Tx = pair.txns?.h1 ?? {};
  const buysH1 = Number(h1Tx.buys ?? 0);
  const sellsH1 = Number(h1Tx.sells ?? 0);
  const price = Number(pair.priceUsd);
  const liquidDexCount = new Set(pairs.filter((item) => item.chainId === "solana" && Number(item.liquidity?.usd ?? 0) >= 5_000).map((item) => item.dexId).filter(Boolean)).size;
  return {
    pairAddress, baseAddress, symbol: pair.baseToken?.symbol || "?", name: pair.baseToken?.name || pair.baseToken?.symbol || "توكن غير مسمى",
    dexId: pair.dexId || "غير معروف", sourceUrl: pair.url || profile.url || `https://dexscreener.com/solana/${pairAddress}`, imageUrl: safeImageUrl(pair, profile),
    priceUsd: Number.isFinite(price) ? price : null, liquidityUsd: Number(pair.liquidity?.usd ?? 0), volumeH1: Number(pair.volume?.h1 ?? 0), volumeH24: Number(pair.volume?.h24 ?? 0),
    transactionsH1: buysH1 + sellsH1, buysH1, sellsH1, priceChangeM5: Number(pair.priceChange?.m5 ?? 0), priceChangeH1: Number(pair.priceChange?.h1 ?? 0),
    priceChangeH6: Number(pair.priceChange?.h6 ?? 0), priceChangeH24: Number(pair.priceChange?.h24 ?? 0), pairCreatedAt: typeof pair.pairCreatedAt === "number" ? pair.pairCreatedAt : null,
    discoverySources: Array.from(profile.sources), liquidDexCount: Math.max(1, liquidDexCount), metadataCompleteness: metadataScore(pair, profile),
  };
}

async function fetchLatestSolanaMarketUncached(): Promise<MarketFetchResult> {
  const telemetry: SourceTelemetry = { source: "DEX Screener", requestCount: 0, throttled: false, slowRequestCount: 0, errorCount: 0, latestStatus: null, maxLatencyMs: 0, capturedAt: Date.now() };
  const collected = new Map<string, ProfileWithSource>();
  await Promise.all(DISCOVERY_PATHS.map(async ({ path, source }) => {
    try {
      const profiles = await dexFetch<TokenProfile[]>(path, telemetry);
      for (const profile of profiles) {
        if (profile.chainId !== "solana" || !profile.tokenAddress) continue;
        const current = collected.get(profile.tokenAddress) ?? { ...profile, sources: new Set<string>() };
        current.sources.add(source);
        collected.set(profile.tokenAddress, current);
      }
    } catch { /* Optional discovery streams retain failure only in telemetry. */ }
  }));
  if (!collected.size) throw new Error("تعذر الحصول على مرشحين من مصادر DEX Screener العامة");
  const profiles = Array.from(collected.values()).slice(0, 64);
  const pairGroups = await Promise.all(profiles.map(async (profile) => {
    try { return { profile, pairs: await dexFetch<DexScreenerPair[]>(`/token-pairs/v1/solana/${profile.tokenAddress}`, telemetry) }; }
    catch { return { profile, pairs: [] as DexScreenerPair[] }; }
  }));
  const byAddress = new Map<string, TokenCandidate>();
  for (const { profile, pairs } of pairGroups) {
    const solanaPairs = pairs.filter((pair) => pair.chainId === "solana" && pair.pairAddress);
    const bestPair = [...solanaPairs].sort((left, right) => Number(right.liquidity?.usd ?? 0) - Number(left.liquidity?.usd ?? 0))[0];
    if (!bestPair) continue;
    const candidate = toCandidate(bestPair, solanaPairs, profile);
    if (!candidate) continue;
    const existing = byAddress.get(candidate.baseAddress);
    if (!existing || candidate.liquidityUsd > existing.liquidityUsd) byAddress.set(candidate.baseAddress, candidate);
  }
  return { candidates: Array.from(byAddress.values()).sort((left, right) => right.liquidityUsd - left.liquidityUsd), telemetry };
}

export async function fetchLatestSolanaMarket(): Promise<MarketFetchResult> {
  if (cachedMarket && cachedMarket.expiresAt > Date.now()) return cachedMarket.value;
  if (pendingMarketFetch) return pendingMarketFetch;
  pendingMarketFetch = fetchLatestSolanaMarketUncached();
  try {
    const market = await pendingMarketFetch;
    cachedMarket = { value: market, expiresAt: Date.now() + MARKET_CACHE_TTL_MS };
    return market;
  } finally {
    pendingMarketFetch = null;
  }
}

async function fetchEarlySolanaDiscoveryUncached(): Promise<MarketFetchResult> {
  const telemetry: SourceTelemetry = { source: "DEX Screener Early Discovery", requestCount: 0, throttled: false, slowRequestCount: 0, errorCount: 0, latestStatus: null, maxLatencyMs: 0, capturedAt: Date.now() };
  const profiles = await dexFetch<TokenProfile[]>("/token-profiles/latest/v1", telemetry);
  const solanaProfiles = profiles
    .filter((profile) => profile.chainId === "solana" && profile.tokenAddress)
    .slice(0, Math.min(EARLY_DISCOVERY_PROFILE_LIMIT * 2, 24))
    .map((profile) => ({ ...profile, sources: new Set(["رصد مبكر: ملفات حديثة"]) }));
  const pairGroups = await Promise.all(solanaProfiles.map(async (profile) => {
    try { return { profile, pairs: await dexFetch<DexScreenerPair[]>(`/token-pairs/v1/solana/${profile.tokenAddress}`, telemetry) }; }
    catch { return { profile, pairs: [] as DexScreenerPair[] }; }
  }));
  const candidates = new Map<string, TokenCandidate>();
  for (const { profile, pairs } of pairGroups) {
    const solanaPairs = pairs.filter((pair) => pair.chainId === "solana" && pair.pairAddress);
    const bestPair = [...solanaPairs].sort((left, right) => Number(right.liquidity?.usd ?? 0) - Number(left.liquidity?.usd ?? 0))[0];
    if (!bestPair) continue;
    const candidate = toCandidate(bestPair, solanaPairs, profile);
    if (!candidate || candidate.liquidityUsd < EARLY_DISCOVERY_MIN_LIQUIDITY_USD) continue;
    const current = candidates.get(candidate.baseAddress);
    if (!current || candidate.liquidityUsd > current.liquidityUsd) candidates.set(candidate.baseAddress, candidate);
  }
  return { candidates: Array.from(candidates.values()).sort((left, right) => (right.pairCreatedAt ?? 0) - (left.pairCreatedAt ?? 0)), telemetry };
}

export async function fetchEarlySolanaDiscovery(): Promise<MarketFetchResult> {
  if (cachedEarlyDiscovery && cachedEarlyDiscovery.expiresAt > Date.now()) return cachedEarlyDiscovery.value;
  if (pendingEarlyDiscovery) return pendingEarlyDiscovery;
  pendingEarlyDiscovery = fetchEarlySolanaDiscoveryUncached();
  try {
    const result = await pendingEarlyDiscovery;
    cachedEarlyDiscovery = { value: result, expiresAt: Date.now() + EARLY_DISCOVERY_CACHE_TTL_MS };
    return result;
  } finally {
    pendingEarlyDiscovery = null;
  }
}

export async function fetchJupiterPrices(addresses: string[]): Promise<JupiterPrices> {
  const unique = Array.from(new Set(addresses)).slice(0, 50);
  const unavailableAddresses = new Set(unique);
  if (!unique.length) return { prices: new Map(), unavailableAddresses, status: null };
  try {
    const response = await fetch(`${JUPITER_PRICE_URL}?ids=${encodeURIComponent(unique.join(","))}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { prices: new Map(), unavailableAddresses, status: response.status };
    const payload = await response.json() as Record<string, JupiterTokenPrice>;
    const prices = new Map<string, number>();
    for (const [address, entry] of Object.entries(payload)) {
      if (typeof entry.usdPrice === "number" && Number.isFinite(entry.usdPrice) && entry.usdPrice > 0) { prices.set(address, entry.usdPrice); unavailableAddresses.delete(address); }
    }
    return { prices, unavailableAddresses, status: response.status };
  } catch { return { prices: new Map(), unavailableAddresses, status: null }; }
}

export async function fetchLatestSolanaCandidates() { return (await fetchLatestSolanaMarket()).candidates; }

export async function fetchTokenPriceUsd(baseAddress: string): Promise<number | null> {
  const telemetry: SourceTelemetry = { source: "DEX Screener", requestCount: 0, throttled: false, slowRequestCount: 0, errorCount: 0, latestStatus: null, maxLatencyMs: 0, capturedAt: Date.now() };
  const pairs = await dexFetch<DexScreenerPair[]>(`/token-pairs/v1/solana/${baseAddress}`, telemetry);
  const best = pairs.filter((pair) => pair.chainId === "solana" && pair.priceUsd).sort((left, right) => Number(right.liquidity?.usd ?? 0) - Number(left.liquidity?.usd ?? 0))[0];
  return best?.priceUsd ? Number(best.priceUsd) : null;
}
