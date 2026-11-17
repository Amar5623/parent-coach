"use client";

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { cx } from "@/lib/cx";
import type { UiStrings } from "@/lib/i18n";
import { containsArabicScript } from "@/lib/language";
import { MAX_USER_MESSAGE_CHARS } from "@/lib/limits";
import { SendIcon, StopIcon } from "./icons";

interface ComposerProps {
  value: string;
  busy: boolean;
  t: UiStrings;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

/** Show the remaining-characters hint once the parent is close to the limit. */
const COUNTER_THRESHOLD = 200;

export function Composer({ value, busy, t, inputRef, onChange, onSend, onStop }: ComposerProps) {
  const canSend = !busy && value.trim().length > 0;
  const remaining = MAX_USER_MESSAGE_CHARS - value.length;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) onSend();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line. Ignore Enter while an IME is composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-line bg-canvas px-3 pb-3 pt-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm transition-colors focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/15">
          <label htmlFor="composer-input" className="sr-only">
            {t.inputLabel}
          </label>
          <textarea
            id="composer-input"
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            maxLength={MAX_USER_MESSAGE_CHARS}
            rows={1}
            // Follow the typed text's direction; when empty, inherit the UI direction
            // so the placeholder sits on the correct side.
            dir={value.trim() ? "auto" : undefined}
            className={cx(
              "field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-7 text-ink placeholder:text-muted/80 focus:outline-none",
              containsArabicScript(value) && "urdu-text",
            )}
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-brand"
            >
              <StopIcon width={16} height={16} />
              {t.stop}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="hidden sm:inline">{t.send}</span>
              <SendIcon width={18} height={18} className="rtl:-scale-x-100" />
              <span className="sr-only sm:hidden">{t.send}</span>
            </button>
          )}
        </div>
        <div className="mt-2 flex items-start justify-between gap-4 px-1 text-xs leading-relaxed text-muted">
          <p>{t.disclaimer}</p>
          {remaining <= COUNTER_THRESHOLD && (
            <p aria-live="polite" className={cx("shrink-0 tabular-nums", remaining <= 20 && "text-danger")}>
              {t.charsLeft(remaining)}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
