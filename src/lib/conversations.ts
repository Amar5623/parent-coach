import { isLanguage } from "./language";
import {
  CLIENT_HISTORY_MESSAGES,
  MAX_ASSISTANT_MESSAGE_CHARS,
  MAX_STORED_CONVERSATIONS,
} from "./limits";
import type { ApiMessage, ChatMessage, Conversation, Language, MessageStatus } from "./types";

export const STORAGE_KEY = "parent-coach:conversations:v1";
export const LANGUAGE_STORAGE_KEY = "parent-coach:language";

const TITLE_MAX_CHARS = 48;

/** The subset of the Web Storage API we use; makes the helpers easy to test. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createMessage(
  role: ChatMessage["role"],
  content: string,
  language: Language,
  status: MessageStatus = "done",
): ChatMessage {
  return { id: createId(), role, content, language, status, createdAt: Date.now() };
}

export function deriveTitle(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(singleLine); // don't cut surrogate pairs in half
  return chars.length > TITLE_MAX_CHARS
    ? `${chars.slice(0, TITLE_MAX_CHARS).join("").trimEnd()}…`
    : singleLine;
}

export function createConversation(firstMessage: ChatMessage): Conversation {
  const now = Date.now();
  return {
    id: createId(),
    title: deriveTitle(firstMessage.content),
    messages: [firstMessage],
    createdAt: now,
    updatedAt: now,
  };
}

/** Newest first. */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function appendMessages(
  conversations: Conversation[],
  conversationId: string,
  messages: ChatMessage[],
): Conversation[] {
  return conversations.map((c) =>
    c.id === conversationId
      ? { ...c, messages: [...c.messages, ...messages], updatedAt: Date.now() }
      : c,
  );
}

export function updateMessage(
  conversations: Conversation[],
  conversationId: string,
  messageId: string,
  update: (message: ChatMessage) => ChatMessage,
): Conversation[] {
  return conversations.map((c) =>
    c.id === conversationId
      ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? update(m) : m)) }
      : c,
  );
}

export function removeMessage(
  conversations: Conversation[],
  conversationId: string,
  messageId: string,
): Conversation[] {
  return conversations.map((c) =>
    c.id === conversationId ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c,
  );
}

export function deleteConversation(
  conversations: Conversation[],
  conversationId: string,
): Conversation[] {
  return conversations.filter((c) => c.id !== conversationId);
}

/**
 * Builds the history sent to the server: user messages plus completed
 * assistant replies only (stopped/failed partial replies are left out),
 * limited to the most recent messages.
 */
export function toApiMessages(messages: ChatMessage[]): ApiMessage[] {
  return messages
    .filter((m) => m.content.trim() !== "" && (m.role === "user" || m.status === "done"))
    .slice(-CLIENT_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? m.content.slice(0, MAX_ASSISTANT_MESSAGE_CHARS) : m.content,
    }));
}

// --- Persistence -----------------------------------------------------------

const STATUSES: readonly MessageStatus[] = ["streaming", "done", "stopped", "error"];

function parseMessage(value: unknown): ChatMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (
    typeof m.id !== "string" ||
    (m.role !== "user" && m.role !== "assistant") ||
    typeof m.content !== "string" ||
    !isLanguage(m.language) ||
    typeof m.createdAt !== "number"
  ) {
    return null;
  }
  let status: MessageStatus = STATUSES.includes(m.status as MessageStatus)
    ? (m.status as MessageStatus)
    : "done";
  // A reply that was still streaming when the page closed never completed.
  if (status === "streaming") status = m.content ? "stopped" : "error";
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    language: m.language,
    status,
    createdAt: m.createdAt,
    ...(status === "error" ? { errorCode: "interrupted" as const } : {}),
  };
}

function parseConversation(value: unknown): Conversation | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (
    typeof c.id !== "string" ||
    typeof c.title !== "string" ||
    !Array.isArray(c.messages) ||
    typeof c.createdAt !== "number" ||
    typeof c.updatedAt !== "number"
  ) {
    return null;
  }
  const messages = c.messages.map(parseMessage).filter((m): m is ChatMessage => m !== null);
  if (messages.length === 0) return null;
  return { id: c.id, title: c.title, messages, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

/** Loads saved conversations, skipping anything malformed. Never throws. */
export function loadConversations(storage: KeyValueStorage | null): Conversation[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    const list =
      typeof data === "object" && data !== null && Array.isArray((data as { conversations?: unknown }).conversations)
        ? (data as { conversations: unknown[] }).conversations
        : [];
    return sortConversations(
      list.map(parseConversation).filter((c): c is Conversation => c !== null),
    );
  } catch {
    return [];
  }
}

/**
 * Saves conversations (newest first, capped). Only the fields needed to
 * restore a chat are written. Returns false if storage is unavailable/full.
 */
export function saveConversations(
  storage: KeyValueStorage | null,
  conversations: Conversation[],
): boolean {
  if (!storage) return false;
  const toStore = sortConversations(conversations)
    .filter((c) => c.messages.length > 0)
    .slice(0, MAX_STORED_CONVERSATIONS)
    .map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: c.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        language: m.language,
        status: m.status,
        createdAt: m.createdAt,
      })),
    }));
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, conversations: toStore }));
    return true;
  } catch {
    return false;
  }
}

export function loadLanguage(storage: KeyValueStorage | null): Language {
  try {
    const value = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : "en";
  } catch {
    return "en";
  }
}

export function saveLanguage(storage: KeyValueStorage | null, language: Language): void {
  try {
    storage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore: the preference simply won't persist.
  }
}

/** `window.localStorage`, or null when unavailable (SSR, privacy mode, etc.). */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
