import { isChatErrorCode, readEventStream, StreamError } from "./stream";
import type { ApiMessage, ChatErrorCode, Language } from "./types";

export type ReplyResult =
  | { status: "done"; text: string }
  | { status: "stopped"; text: string }
  | { status: "error"; text: string; code: ChatErrorCode };

export interface RequestReplyOptions {
  language: Language;
  messages: ApiMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  fetchImpl?: typeof fetch;
}

function codeForStatus(status: number): ChatErrorCode {
  if (status === 400) return "invalid_request";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status === 504) return "timeout";
  return "upstream_error";
}

async function readErrorCode(response: Response): Promise<ChatErrorCode> {
  try {
    const data: unknown = await response.json();
    const code = (data as { error?: unknown } | null)?.error;
    if (isChatErrorCode(code)) return code;
  } catch {
    // Not JSON – fall back to the HTTP status.
  }
  return codeForStatus(response.status);
}

/**
 * Requests a coach reply and streams it through `onDelta`. Never throws:
 * the result says whether the reply completed, was stopped, or failed, and
 * always carries whatever text arrived.
 */
export async function requestCoachReply({
  language,
  messages,
  signal,
  onDelta,
  fetchImpl = fetch,
}: RequestReplyOptions): Promise<ReplyResult> {
  let text = "";
  const fail = (code: ChatErrorCode): ReplyResult =>
    signal.aborted ? { status: "stopped", text } : { status: "error", text, code };

  let response: Response;
  try {
    response = await fetchImpl("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, messages }),
      signal,
    });
  } catch {
    return fail("network");
  }

  if (!response.ok || !response.body) {
    return fail(await readErrorCode(response));
  }

  try {
    text = await readEventStream(response.body, (delta) => {
      text += delta;
      onDelta(delta);
    });
    return { status: "done", text };
  } catch (error) {
    return fail(error instanceof StreamError ? error.code : "interrupted");
  }
}
