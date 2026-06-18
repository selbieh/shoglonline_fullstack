import { describe, expect, it } from "vitest";

import { flattenKeys, getMessages } from "@/lib/i18n";
import { ar } from "@/messages/ar";
import { en } from "@/messages/en";

describe("i18n catalog", () => {
  it("a stub second locale has EXACTLY the same keys as ar (AC-2: no missing keys, no layout change)", () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(ar).sort());
  });

  it("getMessages defaults to ar and resolves a requested locale", () => {
    expect(getMessages().brand).toBe("شغل أونلاين");
    expect(getMessages("ar").nav.jobs).toBe("الوظائف");
    expect(getMessages("en").nav.jobs).toBe("Jobs");
  });

  it("falls back to the default locale for an unknown locale", () => {
    // @ts-expect-error — exercising the runtime fallback for an unsupported locale
    expect(getMessages("fr").brand).toBe("شغل أونلاين");
  });
});
