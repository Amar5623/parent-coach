import { describe, expect, it } from "vitest";
import { getStrings } from "./i18n";
import { arabicScriptRatio, containsArabicScript, getDirection, isLanguage } from "./language";

describe("language helpers", () => {
  it("recognises supported languages only", () => {
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("ur")).toBe(true);
    expect(isLanguage("ar")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });

  it("maps Urdu to RTL and English to LTR", () => {
    expect(getDirection("ur")).toBe("rtl");
    expect(getDirection("en")).toBe("ltr");
  });

  it("detects Urdu script", () => {
    expect(containsArabicScript("میرا بچہ")).toBe(true);
    expect(containsArabicScript("Mera bacha")).toBe(false);
  });

  it("measures the share of Arabic-script letters, ignoring digits and punctuation", () => {
    expect(arabicScriptRatio("سلام")).toBe(1);
    expect(arabicScriptRatio("hello")).toBe(0);
    expect(arabicScriptRatio("۱۔ 2. !?")).toBe(0);
    expect(arabicScriptRatio("ab سل")).toBeCloseTo(0.5);
  });
});

describe("UI strings", () => {
  it("provides the same keys in English and Urdu", () => {
    const en = getStrings("en");
    const ur = getStrings("ur");
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ur.errors).sort()).toEqual(Object.keys(en.errors).sort());
    expect(ur.examples).toHaveLength(en.examples.length);
  });

  it("writes Urdu labels in Urdu script", () => {
    const ur = getStrings("ur");
    for (const label of [ur.appName, ur.send, ur.newChat, ur.placeholder, ur.disclaimer, ...ur.examples]) {
      expect(arabicScriptRatio(label)).toBeGreaterThan(0.8);
    }
  });
});
