import { isLanguage } from "./language";
import {
  MAX_ASSISTANT_MESSAGE_CHARS,
  MAX_REQUEST_MESSAGES,
  MAX_USER_MESSAGE_CHARS,
} from "./limits";
import type { ApiMessage, ChatRequestBody } from "./types";

export type ValidationResult =
  | { ok: true; value: ChatRequestBody }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted `/api/chat` payload. Only `user` and `assistant`
 * roles are accepted, so clients can never inject system instructions.
 * Unknown fields are dropped from the returned value.
 */
export function validateChatRequest(body: unknown): ValidationResult {
  if (!isPlainObject(body)) return { ok: false, error: "Body must be a JSON object." };

  if (!isLanguage(body.language)) {
    return { ok: false, error: "language must be 'en' or 'ur'." };
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "messages must be a non-empty array." };
  }
  if (messages.length > MAX_REQUEST_MESSAGES) {
    return { ok: false, error: `messages may contain at most ${MAX_REQUEST_MESSAGES} items.` };
  }

  const clean: ApiMessage[] = [];
  for (const [index, message] of messages.entries()) {
    if (!isPlainObject(message)) {
      return { ok: false, error: `messages[${index}] must be an object.` };
    }
    const { role, content } = message;
    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: `messages[${index}].role must be 'user' or 'assistant'.` };
    }
    if (typeof content !== "string") {
      return { ok: false, error: `messages[${index}].content must be a string.` };
    }
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: `messages[${index}].content must not be empty.` };
    }
    const limit = role === "user" ? MAX_USER_MESSAGE_CHARS : MAX_ASSISTANT_MESSAGE_CHARS;
    if (trimmed.length > limit) {
      return { ok: false, error: `messages[${index}].content exceeds ${limit} characters.` };
    }
    clean.push({ role, content: trimmed });
  }

  if (clean[clean.length - 1].role !== "user") {
    return { ok: false, error: "The last message must be from the user." };
  }

  return { ok: true, value: { language: body.language, messages: clean } };
}
