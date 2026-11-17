import type { Language } from "./types";

export const LANGUAGES: readonly Language[] = ["en", "ur"];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  ur: "اردو",
};

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "ur";
}

export function getDirection(language: Language): "ltr" | "rtl" {
  return language === "ur" ? "rtl" : "ltr";
}

// Urdu is written in the Arabic script.
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const LETTER = /\p{L}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;

export function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/**
 * Share of letters written in Arabic script (0–1). Digits, punctuation and
 * whitespace are ignored. Returns 0 for text with no letters.
 */
export function arabicScriptRatio(text: string): number {
  let arabic = 0;
  let latin = 0;
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    if (ARABIC_SCRIPT.test(char)) arabic++;
    else if (LATIN_LETTER.test(char)) latin++;
  }
  const total = arabic + latin;
  return total === 0 ? 0 : arabic / total;
}
