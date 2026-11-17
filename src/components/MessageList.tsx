"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import { toDisplayText } from "@/lib/format";
import type { UiStrings } from "@/lib/i18n";
import { containsArabicScript, getDirection } from "@/lib/language";
import type { ChatMessage } from "@/lib/types";
import { SproutIcon } from "./icons";

interface MessageListProps {
  messages: ChatMessage[];
  busy: boolean;
  t: UiStrings;
  onRetry: (messageId: string) => void;
}

/** Distance from the bottom (px) within which new content keeps the view pinned. */
const STICK_THRESHOLD = 80;

export function MessageList({ messages, busy, t, onRetry }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Follow streaming text only while the reader is already at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div
        role="log"
        aria-busy={busy}
        className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6"
      >
        {messages.map((message) =>
          message.role === "user" ? (
            <UserMessage key={message.id} message={message} t={t} />
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              t={t}
              canRetry={!busy && message.id === lastId}
              onRetry={() => onRetry(message.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function UserMessage({ message, t }: { message: ChatMessage; t: UiStrings }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-brand-soft px-4 py-2.5 text-[15px] leading-7 text-ink">
        <span className="sr-only">{t.you}: </span>
        {/* The parent may type in either language, so let the browser pick the direction. */}
        <p
          dir="auto"
          className={cx("whitespace-pre-wrap break-words", containsArabicScript(message.content) && "urdu-text")}
        >
          {message.content}
        </p>
      </div>
    </div>
  );
}

interface AssistantMessageProps {
  message: ChatMessage;
  t: UiStrings;
  canRetry: boolean;
  onRetry: () => void;
}

function AssistantMessage({ message, t, canRetry, onRetry }: AssistantMessageProps) {
  const { content, status, language } = message;
  const retryButton = canRetry && (
    <button
      type="button"
      onClick={onRetry}
      className="rounded-md px-2 py-0.5 text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand"
    >
      {t.retry}
    </button>
  );

  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden="true"
        className="mt-1 hidden size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white sm:flex"
      >
        <SproutIcon width={18} height={18} />
      </div>
      <div className="min-w-0 max-w-[90%] rounded-2xl rounded-ss-md border border-line bg-surface px-4 py-3 text-[15px] leading-7 shadow-sm sm:max-w-[85%]">
        <span className="sr-only">{t.coach}: </span>
        {content ? (
          // Direction is set per message from the reply language, so streamed
          // Urdu text lays out right-to-left from its first character.
          <div
            dir={getDirection(language)}
            lang={language}
            className={cx("whitespace-pre-wrap break-words", language === "ur" && "urdu-text")}
          >
            {toDisplayText(content)}
          </div>
        ) : (
          status === "streaming" && <TypingIndicator label={t.thinking} />
        )}

        {status === "error" && (
          <div
            role="alert"
            className={cx(
              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger",
              content && "mt-3",
            )}
          >
            <span>{t.errors[message.errorCode ?? "upstream_error"]}</span>
            {retryButton}
          </div>
        )}

        {status === "stopped" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{t.stopped}</span>
            {retryButton}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <span className="sr-only">{label}</span>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className="size-2 rounded-full bg-brand/60 motion-safe:animate-pulse"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  t: UiStrings;
  disabled: boolean;
  onPick: (text: string) => void;
}

export function EmptyState({ t, disabled, onPick }: EmptyStateProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-12 text-center sm:py-20">
        <div className="mb-5 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <SproutIcon width={26} height={26} />
        </div>
        <h2 className="text-xl font-semibold text-ink sm:text-2xl">{t.emptyTitle}</h2>
        <p className="mt-2 text-[15px] leading-7 text-muted">{t.emptyBody}</p>

        <h3 className="mt-8 text-xs font-semibold tracking-wide text-muted">{t.examplesLabel}</h3>
        <ul className="mt-3 flex w-full flex-col gap-2">
          {t.examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(example)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-start text-sm leading-6 text-ink shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/60 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
