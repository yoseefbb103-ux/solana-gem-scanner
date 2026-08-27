import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EarlyWatchCard } from "./EarlyWatchCard";

describe("EarlyWatchCard", () => {
  it("يعرض التأكيد وزمن انتقاله عند وصول حالة مؤكدة من تغذية القراءة فقط", () => {
    const markup = renderToStaticMarkup(<EarlyWatchCard
      watch={{ baseAddress: "mint", symbol: "CONF", name: "Confirmed Token", sourceUrl: "https://example.test", firstLiquidityUsd: 10_000, firstSeenAt: 1_000, stage: "confirmed", confirmedAt: 181_000 }}
      formatTime={() => "وقت اختبار"}
      currency={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" })}
    />);

    expect(markup).toContain("مؤكد");
    expect(markup).toContain("تأكيد بعد 3 د");
    expect(markup).toContain("وقت اختبار");
  });
});
