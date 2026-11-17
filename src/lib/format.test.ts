import { describe, expect, it } from "vitest";
import { countWords, toDisplayText } from "./format";

describe("toDisplayText", () => {
  it("strips bold markers and headings", () => {
    expect(toDisplayText("## Plan\n**Stay calm** and __breathe__.")).toBe("Plan\nStay calm and breathe.");
  });

  it("keeps numbered steps untouched", () => {
    const text = "That sounds hard.\n1. Give a warning.\n2. Offer a choice.\nHow did it go?";
    expect(toDisplayText(text)).toBe(text);
  });

  it("turns Markdown bullets into simple bullets", () => {
    expect(toDisplayText("- one\n* two")).toBe("• one\n• two");
  });

  it("leaves Urdu text and Urdu numbering intact", () => {
    const text = "یہ مشکل وقت ہے۔\n۱۔ پرسکون رہیں۔\n۲۔ وقت دیں۔\nکیا یہ مددگار رہا؟";
    expect(toDisplayText(text)).toBe(text);
  });

  it("is safe on partial streamed text", () => {
    expect(toDisplayText("**Stay ca")).toBe("**Stay ca");
  });

  it("collapses excessive blank lines", () => {
    expect(toDisplayText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("countWords", () => {
  it("counts English and Urdu words", () => {
    expect(countWords("one two  three")).toBe(3);
    expect(countWords("میرا بچہ سوتا نہیں")).toBe(4);
    expect(countWords("   ")).toBe(0);
  });
});
