import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTelegramAlert, sendTelegramEarlyWatch } from "./telegram";

const candidate = {
  pairAddress: "pair", baseAddress: "mint", symbol: "TEST", name: "Test", dexId: "raydium", sourceUrl: "https://dexscreener.com/solana/pair", imageUrl: null,
  priceUsd: 0.1, liquidityUsd: 40_000, volumeH1: 10_000, volumeH24: 50_000, transactionsH1: 30, buysH1: 18, sellsH1: 12,
  priceChangeM5: 2, priceChangeH1: 7, priceChangeH6: 5, priceChangeH24: 4, pairCreatedAt: Date.now(), ageHours: 1,
  opportunityScore: 75, riskScore: 20, scoreDelta: 4, factors: ["سيولة قابلة للتداول", "زخم متسق"], warnings: ["تحقق يدوياً"], decision: "monitor" as const, signalTier: "strong" as const, liquidityPullDetected: false,
  estimatedSlippage200: 0.5, estimatedSlippage500: 1.2, momentumConsistency: "positive" as const, jupiterPriceUsd: 0.1, priceDivergencePct: 0, liquidityDeltaPct: 2, liquidityGrowthStable: true,
  security: { baseAddress: "mint", pairAddress: "pair", symbol: "TEST", source: "RugCheck", status: "passed" as const, mintAuthorityOpen: false, freezeAuthorityOpen: false, lpLockStatus: "locked" as const, holderTopPct: 10, holderTop10Pct: 40, creatorAddress: null, ruggedCreator: false, knownRuggedDeployer: false, sprayCount24h: 0, rugcheckScore: 2, symbolConflict: false, deepScanApplied: true, holderClusterScore: null, bundleDetected: null, washTradingScore: null, fundingSourceOverlap: null, fundingEvidenceStatus: "unavailable" as const, token2022Flags: [], lpBurnVerified: null, lpMintAddresses: [], flags: [], checkedAt: Date.now() },
};

const watch = { baseAddress: "mint", pairAddress: "pair", symbol: "EARLY", name: "Early", sourceUrl: "https://dexscreener.com/solana/pair", discoverySources: ["ملفات حديثة"], firstLiquidityUsd: 6_000, pairCreatedAt: Date.now(), firstSeenAt: Date.now(), lastSeenAt: Date.now(), stage: "early" as const, confirmedAt: null, priceUsd: 0.00001, volumeH1: 4_000, transactionsH1: 80, buysH1: 48, sellsH1: 32, priceChangeM5: 4, priceChangeH1: 12, imageUrl: null };

describe("sendTelegramAlert", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("يتخطى التسليم عند غياب بيانات الاعتماد", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", ""); vi.stubEnv("TELEGRAM_CHAT_ID", "");
    await expect(sendTelegramAlert(candidate)).resolves.toEqual({ status: "skipped", detail: "تنبيهات تيليجرام غير مهيأة" });
  });
  it("يرسل قالب جوهرة مختصر عند اجتياز البوابات", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramAlert(candidate)).resolves.toEqual({ status: "sent", detail: "تم إرسال جوهرة" });
    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain("جوهرة منتقاة"); expect(body).toContain("الإشارة: قوية"); expect(body).toContain("وليس توصية شراء أو بيع");
    expect(body).not.toContain("عوامل داعمة:"); expect(body).not.toContain("لا توجد تحذيرات");
  });
  it("يرسل صورة العملة عند توفر رابط HTTPS", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramAlert({ ...candidate, imageUrl: "https://cdn.example.com/test.png" })).resolves.toEqual({ status: "sent", detail: "تم إرسال جوهرة بصورة" });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("sendPhoto"); expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("https://cdn.example.com/test.png");
  });
  it("يعود إلى النص إذا تعذر تحميل الصورة", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ ok: false }) }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) }); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramAlert({ ...candidate, imageUrl: "https://cdn.example.com/broken.png" })).resolves.toEqual({ status: "sent", detail: "تم إرسال الجوهرة نصياً بعد تعذر الصورة" });
    expect(fetchMock.mock.calls[1]?.[0]).toContain("sendMessage");
  });
  it("يرفض المرشح منخفض الجودة ولا يتصل بـ Telegram", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramAlert({ ...candidate, signalTier: "watch", opportunityScore: 50 })).resolves.toEqual({ status: "skipped", detail: "تم استبعاد التنبيه: ليس جوهرة مؤهلة لـ Telegram" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("يرسل الرصد المبكر المقبول خلال خمس دقائق بقالب مراقبة واضح", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramEarlyWatch(watch)).resolves.toEqual({ status: "sent", detail: "تم إرسال جوهرة" });
    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain("رصد مبكر | مراقبة فقط"); expect(body).toContain("لم يكتمل التأكيد"); expect(body).not.toContain("جوهرة منتقاة");
  });
  it("يرفض الرصد المبكر منخفض السيولة ولا يتصل بـ Telegram", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramEarlyWatch({ ...watch, firstLiquidityUsd: 2_000 })).resolves.toEqual({ status: "skipped", detail: "تم استبعاد الرصد المبكر: العمر أو السيولة أو النشاط أو تغير السعر خارج البوابة" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("يرفض الرصد المبكر الذي قفز سعره قبل التنبيه", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramEarlyWatch({ ...watch, priceChangeM5: 60 })).resolves.toEqual({ status: "skipped", detail: "تم استبعاد الرصد المبكر: العمر أو السيولة أو النشاط أو تغير السعر خارج البوابة" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("لا يرسل التحذيرات التشغيلية إلى Telegram", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramAlert({ ...candidate, liquidityPullDetected: true }, "liquidity_pull")).resolves.toEqual({ status: "skipped", detail: "تم استبعاد التنبيه: ليس جوهرة مؤهلة لـ Telegram" });
    await expect(sendTelegramAlert(candidate, "decision_flip")).resolves.toEqual({ status: "skipped", detail: "تم استبعاد التنبيه: ليس جوهرة مؤهلة لـ Telegram" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

  it("يرفض الجوهرة ذات الثقة المنخفضة حتى مع إشارة strong", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramAlert({ ...candidate, confidence: { data: 82, safety: 45, momentum: 70, manipulation: 90 } })).resolves.toEqual({ status: "skipped", detail: "تم استبعاد التنبيه: ليس جوهرة مؤهلة لـ Telegram" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
