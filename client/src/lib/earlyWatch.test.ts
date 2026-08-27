import { describe, expect, it } from "vitest";
import { confirmationLatencyLabel, earlyWatchStageLabel } from "./earlyWatch";

describe("عرض مراحل الرصد المبكر", () => {
  it("يعرض حالة الرصد الأولي والتأكيد بعبارات منفصلة", () => {
    expect(earlyWatchStageLabel("early")).toBe("رصد أولي");
    expect(earlyWatchStageLabel("confirmed")).toBe("مؤكد");
  });

  it("يعرض زمن الانتقال ولا يحول غياب التأكيد إلى زمن مصطنع", () => {
    expect(confirmationLatencyLabel(1_000, null)).toBe("بانتظار التحقق");
    expect(confirmationLatencyLabel(1_000, 181_000)).toBe("تأكيد بعد 3 د");
  });
});
