import { describe, expect, it } from "vitest";

const verifyLiveCredentials = process.env.VERIFY_TELEGRAM_CREDENTIALS === "1";

describe.skipIf(!verifyLiveCredentials)("Telegram credentials", () => {
  it("validates the configured bot token using the lightweight getMe endpoint", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token, "TELEGRAM_BOT_TOKEN must be configured").toBeTruthy();
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
    expect(response.ok, "Telegram rejected the configured bot token").toBe(true);
    const payload = await response.json() as { ok?: boolean; result?: { is_bot?: boolean } };
    expect(payload.ok).toBe(true);
    expect(payload.result?.is_bot).toBe(true);
  }, 30_000);
});
