"use client";

import { use, useEffect, useRef, useState } from "react";
import { browser } from "react-dom";
import { requestCoachReply } from "@/lib/chat-client";
import {
  appendMessages,
  createConversation,
  createMessage,
  deleteConversation,
  getBrowserStorage,
  loadConversations,
  loadLanguage,
  removeMessage,
  saveConversations,
  saveLanguage,
  sortConversations,
  toApiMessages,
  updateMessage,
} from "@/lib/conversations";
import { cx } from "@/lib/cx";
import { getStrings } from "@/lib/i18n";
import { getDirection } from "@/lib/language";
import type { ChatMessage, Conversation, Language } from "@/lib/types";
import { Composer } from "./Composer";
import { MenuIcon, SproutIcon } from "./icons";
import { LanguageToggle } from "./LanguageToggle";
import { EmptyState, MessageList } from "./MessageList";
import { Sidebar, SIDEBAR_ID } from "./Sidebar";

function isDesktop(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches;
}

export default function CoachApp() {
  // Everything here comes from localStorage, so render only in the browser.
  use(browser("Conversations are stored in the browser's localStorage."));

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations(getBrowserStorage()),
  );
  const [activeId, setActiveId] = useState<string | null>(() => conversations[0]?.id ?? null);
  const [language, setLanguage] = useState<Language>(() => loadLanguage(getBrowserStorage()));
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // The in-flight reply; also a synchronous guard against double submits.
  const inflightRef = useRef<{ controller: AbortController; conversationId: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const t = getStrings(language);
  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Persist once a reply settles (not on every streamed chunk).
  useEffect(() => {
    if (!busy) saveConversations(getBrowserStorage(), conversations);
  }, [conversations, busy]);

  // Cancel any in-flight reply if the app unmounts.
  useEffect(() => () => inflightRef.current?.controller.abort(), []);

  async function streamReply(conversationId: string, history: ChatMessage[]) {
    const reply = createMessage("assistant", "", language, "streaming");
    const controller = new AbortController();
    inflightRef.current = { controller, conversationId };
    setBusy(true);
    setConversations((prev) => appendMessages(prev, conversationId, [reply]));

    const result = await requestCoachReply({
      language,
      messages: toApiMessages(history),
      signal: controller.signal,
      onDelta: (delta) =>
        setConversations((prev) =>
          updateMessage(prev, conversationId, reply.id, (m) => ({ ...m, content: m.content + delta })),
        ),
    });

    setConversations((prev) =>
      updateMessage(prev, conversationId, reply.id, (m) => ({
        ...m,
        content: result.text,
        status: result.status,
        errorCode: result.status === "error" ? result.code : undefined,
      })),
    );
    inflightRef.current = null;
    setBusy(false);
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || inflightRef.current) return;

    const userMessage = createMessage("user", content, language);
    let conversationId: string;
    let history: ChatMessage[];
    if (active) {
      conversationId = active.id;
      history = [...active.messages, userMessage];
      setConversations((prev) => appendMessages(prev, conversationId, [userMessage]));
    } else {
      const conversation = createConversation(userMessage);
      conversationId = conversation.id;
      history = conversation.messages;
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
    }
    setDraft("");
    inputRef.current?.focus();
    void streamReply(conversationId, history);
  }

  function retry(messageId: string) {
    if (!active || inflightRef.current) return;
    const index = active.messages.findIndex((m) => m.id === messageId);
    if (index <= 0) return;
    const conversationId = active.id;
    setConversations((prev) => removeMessage(prev, conversationId, messageId));
    void streamReply(conversationId, active.messages.slice(0, index));
  }

  function closeSidebarOnMobile() {
    if (!isDesktop()) setSidebarOpen(false);
  }

  function startNewConversation() {
    setActiveId(null);
    setDraft("");
    closeSidebarOnMobile();
    inputRef.current?.focus();
  }

  function selectConversation(id: string) {
    setActiveId(id);
    closeSidebarOnMobile();
  }

  function removeConversation(id: string) {
    if (!window.confirm(t.confirmDelete)) return;
    if (inflightRef.current?.conversationId === id) inflightRef.current.controller.abort();
    setConversations((prev) => deleteConversation(prev, id));
    if (activeId === id) setActiveId(null);
  }

  function changeLanguage(next: Language) {
    setLanguage(next);
    saveLanguage(getBrowserStorage(), next);
  }

  return (
    <div
      dir={getDirection(language)}
      lang={language}
      className={cx("flex h-dvh overflow-hidden bg-canvas text-ink", language === "ur" && "ui-urdu")}
    >
      <Sidebar
        open={sidebarOpen}
        conversations={sortConversations(conversations)}
        activeId={activeId}
        t={t}
        onClose={() => setSidebarOpen(false)}
        onNew={startNewConversation}
        onSelect={selectConversation}
        onDelete={removeConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            aria-controls={SIDEBAR_ID}
            aria-label={sidebarOpen ? t.hideSidebar : t.showSidebar}
            title={sidebarOpen ? t.hideSidebar : t.showSidebar}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            <MenuIcon />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span aria-hidden="true" className="hidden text-brand sm:block">
              <SproutIcon width={22} height={22} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-ink">{t.appName}</h1>
              <p className="hidden truncate text-xs text-muted sm:block">{t.tagline}</p>
            </div>
          </div>
          <LanguageToggle language={language} label={t.languageLabel} onChange={changeLanguage} />
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {active ? (
            <MessageList messages={active.messages} busy={busy} t={t} onRetry={retry} />
          ) : (
            <EmptyState t={t} disabled={busy} onPick={send} />
          )}
          <Composer
            value={draft}
            busy={busy}
            t={t}
            inputRef={inputRef}
            onChange={setDraft}
            onSend={() => send(draft)}
            onStop={() => inflightRef.current?.controller.abort()}
          />
        </main>
      </div>

      <p role="status" className="sr-only">
        {busy ? t.responding : ""}
      </p>
    </div>
  );
}
