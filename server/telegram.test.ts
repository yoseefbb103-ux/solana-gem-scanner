import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTelegramAlert, sendTelegramEarlyWatch } from "./telegram";

const candidate = {
  pairAddress: "pair", baseAddress: "mint", symbol: "TEST", name: "Test", dexId: "raydium", sourceUrl: "https://dexscreener.com/solana/pair",
  priceUsd: 0.1, liquidityUsd: 40_000, volumeH1: 10_000, volumeH24: 50_000, transactionsH1: 30, buysH1: 18, sellsH1: 12,
  priceChangeM5: 2, priceChangeH1: 7, priceChangeH6: 5, priceChangeH24: 4, pairCreatedAt: Date.now(), ageHours: 1,
  opportunityScore: 75, riskScore: 20, scoreDelta: 4, factors: ["سيولة قابلة للتداول"], warnings: ["تحقق يدوياً"], decision: "monitor" as const,
  estimatedSlippage200: 0.5, estimatedSlippage500: 1.2, momentumConsistency: "positive" as const,
  security: { baseAddress: "mint", pairAddress: "pair", symbol: "TEST", source: "RugCheck", status: "passed" as const, mintAuthorityOpen: false, freezeAuthorityOpen: false, lpLockStatus: "locked" as const, holderTopPct: 10, holderTop10Pct: 40, creatorAddress: null, ruggedCreator: false, rugcheckScore: 2, symbolConflict: false, deepScanApplied: true, flags: [], checkedAt: Date.now() },
};

describe("sendTelegramAlert", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("skips delivery when credentials are absent", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", ""); vi.stubEnv("TELEGRAM_CHAT_ID", "");
    await expect(sendTelegramAlert(candidate)).resolves.toEqual({ status: "skipped", detail: "تنبيهات تيليجرام غير مهيأة" });
  });
  it("posts only an informational read-only alert when configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramAlert(candidate)).resolves.toEqual({ status: "sent", detail: "تم إرسال تنبيه تيليجرام" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.telegram.org/bottest-token/sendMessage", expect.objectContaining({ method: "POST" }));
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("ليست توصية شراء أو بيع");
  });

  it("يفصل رسالة الرصد المبكر عن التنبيه المؤكد عند إرسالها", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const watch = { baseAddress: "mint", pairAddress: "pair", symbol: "EARLY", name: "Early", sourceUrl: "https://dexscreener.com/solana/pair", discoverySources: ["ملفات حديثة"], firstLiquidityUsd: 2_000, pairCreatedAt: Date.now(), firstSeenAt: Date.now(), lastSeenAt: Date.now(), stage: "early" as const, confirmedAt: null };

    await expect(sendTelegramEarlyWatch(watch)).resolves.toEqual({ status: "sent", detail: "تم إرسال تنبيه تيليجرام" });

    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain("EARLY WATCH");
    expect(body).toContain("لم يكتمل فحص الأمان أو التسعير أو السيولة بعد");
  });

  it("يرسل التنبيه المؤكد بصياغة مستقلة مع التحذير الدائم للقراءة فقط", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTelegramAlert(candidate, "confirmed_alert")).resolves.toEqual({ status: "sent", detail: "تم إرسال تنبيه تيليجرام" });

    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain("CONFIRMED ALERT");
    expect(body).toContain("ليست توصية شراء أو بيع");
  });
});
