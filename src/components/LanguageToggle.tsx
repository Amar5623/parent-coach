import { LANGUAGE_NAMES, LANGUAGES } from "@/lib/language";
import type { Language } from "@/lib/types";

interface LanguageToggleProps {
  language: Language;
  label: string;
  onChange: (language: Language) => void;
}

/** Segmented control built on native radio inputs, so keyboard support is built in. */
export function LanguageToggle({ language, label, onChange }: LanguageToggleProps) {
  return (
    <fieldset className="shrink-0">
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm">
        {LANGUAGES.map((option) => (
          <label key={option} className="relative cursor-pointer">
            <input
              type="radio"
              name="reply-language"
              value={option}
              checked={language === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span
              lang={option}
              className="block rounded-full px-3 py-1 text-muted transition-colors peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-1 hover:text-ink peer-checked:hover:text-white"
            >
              {LANGUAGE_NAMES[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
