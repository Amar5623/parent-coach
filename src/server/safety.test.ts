import { describe, expect, it } from "vitest";
import { arabicScriptRatio } from "@/lib/language";
import { assessRisk, getSafetyResponse, normalizeForMatching } from "./safety";

describe("normalizeForMatching", () => {
  it("unifies Arabic and Urdu letter variants and strips diacritics", () => {
    // Arabic yeh/kaf/heh and a zero-width non-joiner → Urdu forms.
    expect(normalizeForMatching("خود‌كشي")).toBe("خودکشی");
    expect(normalizeForMatching("بےہوش")).toBe("بےہوش");
    expect(normalizeForMatching("بَچّہ")).toBe("بچہ");
  });

  it("lower-cases and normalises apostrophes and whitespace", () => {
    expect(normalizeForMatching("I CAN’T   Breathe")).toBe("i can't breathe");
  });
});

describe("assessRisk: imminent danger (fixed safety reply)", () => {
  it.each([
    // English
    ["self_harm", "I want to kill myself, I can't do this anymore"],
    ["self_harm", "My 15 year old said she is going to end her life tonight"],
    ["self_harm", "my son has been feeling suicidal"],
    ["medical", "My baby is not breathing properly and her lips are turning blue"],
    ["medical", "My toddler swallowed a button battery 10 minutes ago"],
    ["medical", "He drank bleach from under the sink"],
    ["medical", "My daughter is having a seizure right now"],
    ["danger", "I'm going to hurt him if he doesn't stop screaming"],
    ["danger", "My husband is threatening to kill us"],
    ["danger", "I can't find my son, he's been missing since this afternoon"],
    // Urdu script
    ["self_harm", "میں خودکشی کرنا چاہتی ہوں"],
    ["self_harm", "میرا بیٹا کہتا ہے وہ مرنا چاہتا ہے"],
    ["medical", "میرا بچہ بے ہوش ہو گیا ہے"],
    ["medical", "بچے نے زہر کھا لیا ہے"],
    ["medical", "میرے بچے نے صفائی والا کیمیکل پی لیا ہے"],
    ["medical", "میری بیٹی سانس نہیں لے رہی"],
    ["danger", "میرا شوہر کہتا ہے وہ بچوں کو جان سے مار دے گا"],
    // Roman Urdu
    ["self_harm", "mujhe lagta hai main khudkushi kar lun gi"],
    ["medical", "mera beta behosh ho gaya hai"],
    ["danger", "meri beti gum ho gayi hai market mein"],
  ])("flags %s: %s", (category, message) => {
    const risk = assessRisk(message);
    expect(risk.level).toBe("emergency");
    expect(risk.categories).toContain(category);
  });

  it("detects danger in the latest message even mid-conversation and across languages", () => {
    // Previous message is everyday English; the latest switches to Urdu.
    expect(assessRisk("بچے نے گولیاں کھا لیں", "How do I handle bedtime?").level).toBe("emergency");
  });

  it("matches Urdu typed with Arabic keyboard letter forms", () => {
    expect(assessRisk("ميں خودكشي كرنا چاہتي ہوں").level).toBe("emergency");
  });
});

describe("assessRisk: sensitive topics (model with safety reminder)", () => {
  it.each([
    ["abuse", "I think my daughter's tutor touched her inappropriately"],
    ["abuse", "میرے بچے کے ساتھ جنسی زیادتی ہوئی ہے"],
    ["abuse", "میرا شوہر غصے میں بچوں کو بہت مارتا ہے"],
    ["abuse", "mera shohar bachon ko roz maarta hai"],
    ["self_harm", "I found cuts on her arms, is she self-harming?"],
    ["medical", "My 2 year old has had a high fever since yesterday"],
    ["professional", "How much melatonin should I give my 5 year old?"],
    ["professional", "Does my son have ADHD? He can't sit still."],
    ["professional", "How do I get full custody of my kids?"],
    ["professional", "بچے کو بخار کی دوائی کتنی دوں؟"],
    ["professional", "kya mere bete ko autism hai?"],
    ["danger", "I'm scared I might hurt my baby when she won't stop crying"],
  ])("flags %s: %s", (category, message) => {
    const risk = assessRisk(message);
    expect(risk.level).toBe("elevated");
    expect(risk.categories).toContain(category);
  });

  it("keeps context from the previous user message for short follow-ups", () => {
    const risk = assessRisk("She is 4, how much should I give?", "Can I give my daughter ibuprofen?");
    expect(risk.level).toBe("elevated");
    expect(risk.categories).toContain("professional");
  });
});

describe("assessRisk: everyday concerns", () => {
  it.each([
    "My 3-year-old has huge tantrums every time we leave the park.",
    "This tantrum is killing me, I'm so tired.",
    "How do I limit screen time without fights?",
    "My kids fight over toys all the time",
    "My son is nervous about starting a new school",
    "Bedtime takes two hours every night.",
    "میرا بیٹا اسکرین ٹائم پر بہت ضد کرتا ہے",
    "Mera chota beta raat ko sota nahi",
    "She cut herself a slice of cake without asking",
    "He's choking back tears when I drop him at school",
  ])("does not flag: %s", (message) => {
    expect(assessRisk(message)).toEqual({ level: "none", categories: [] });
  });
});

describe("getSafetyResponse", () => {
  it("answers in the selected language", () => {
    const risk = assessRisk("I want to kill myself");
    expect(arabicScriptRatio(getSafetyResponse(risk, "en"))).toBe(0);
    expect(arabicScriptRatio(getSafetyResponse(risk, "ur"))).toBeGreaterThan(0.9);
  });

  it("points to emergency services without inventing phone numbers", () => {
    for (const language of ["en", "ur"] as const) {
      for (const message of ["I want to kill myself", "He swallowed bleach", "He is threatening to kill us"]) {
        const text = getSafetyResponse(assessRisk(message), language);
        expect(text).toMatch(/emergency|ایمرجنسی/i);
        expect(text).not.toMatch(/\d{3}/); // no 911/999/112/1122-style numbers
      }
    }
  });

  it("chooses a message suited to the kind of emergency", () => {
    expect(getSafetyResponse(assessRisk("I want to kill myself"), "en")).toMatch(/crisis line/);
    expect(getSafetyResponse(assessRisk("He swallowed bleach"), "en")).toMatch(/medical emergency/);
    expect(getSafetyResponse(assessRisk("He is threatening to kill us"), "en")).toMatch(/child-protection/);
  });

  it("never promises confidentiality or claims to call for help", () => {
    for (const language of ["en", "ur"] as const) {
      const text = getSafetyResponse(assessRisk("I want to kill myself"), language);
      expect(text).not.toMatch(/confidential|I will call|I'll call|I have called/i);
    }
  });
});
