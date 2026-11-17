export type Language = "en" | "ur";

export type Role = "user" | "assistant";

/**
 * - `streaming`: the reply is still arriving
 * - `done`: the server confirmed the reply completed
 * - `stopped`: the user cancelled the reply part-way
 * - `error`: the request failed or the stream was cut off
 */
export type MessageStatus = "streaming" | "done" | "stopped" | "error";

export type ChatErrorCode =
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "daily_limit"
  | "timeout"
  | "not_configured"
  | "upstream_error"
  | "network"
  | "interrupted";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Language selected when the message was created; drives direction for replies. */
  language: Language;
  status: MessageStatus;
  createdAt: number;
  errorCode?: ChatErrorCode;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** A message as sent to `/api/chat`. Only user/assistant roles are ever accepted. */
export interface ApiMessage {
  role: Role;
  content: string;
}

export interface ChatRequestBody {
  language: Language;
  messages: ApiMessage[];
}

/** Newline-delimited JSON events streamed from `/api/chat`. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; code: ChatErrorCode };
