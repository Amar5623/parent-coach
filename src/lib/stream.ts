/**
 * The tiny streaming protocol between `/api/chat` and the browser.
 *
 * The server sends newline-delimited JSON (NDJSON) events:
 *   {"type":"delta","text":"..."}   – a piece of the reply
 *   {"type":"done"}                 – the reply finished successfully
 *   {"type":"error","code":"..."}   – the reply failed part-way
 *
 * An explicit `done` event means the client never mistakes a cut-off stream
 * for a complete reply. Text is UTF-8 encoded once on the server and decoded
 * with a streaming TextDecoder on the client, so multi-byte characters (such
 * as Urdu letters) split across network chunks are reassembled correctly.
 */
import type { ChatErrorCode, StreamEvent } from "./types";

const ERROR_CODES: readonly ChatErrorCode[] = [
  "invalid_request",
  "payload_too_large",
  "rate_limited",
  "daily_limit",
  "timeout",
  "not_configured",
  "upstream_error",
  "network",
  "interrupted",
];

export function isChatErrorCode(value: unknown): value is ChatErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function encodeEvent(event: StreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export class StreamError extends Error {
  constructor(readonly code: ChatErrorCode) {
    super(`Stream failed: ${code}`);
    this.name = "StreamError";
  }
}

/**
 * Turns an async iterable of text pieces into an NDJSON byte stream.
 * Errors thrown by the source become a final `error` event; cancelling the
 * stream (e.g. the client disconnects) stops the source iterator.
 */
export function createEventStream(
  source: AsyncIterable<string>,
  toErrorCode: (error: unknown) => ChatErrorCode = () => "upstream_error",
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = source[Symbol.asyncIterator]();
  let finished = false;

  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: StreamEvent) => {
    try {
      controller.enqueue(encoder.encode(encodeEvent(event)));
    } catch {
      // The consumer has already gone away; nothing left to deliver.
    }
  };

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>, event: StreamEvent) => {
    finished = true;
    send(controller, event);
    try {
      controller.close();
    } catch {
      // Already closed or cancelled.
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Loop so that empty pieces never leave a pull without output.
        for (;;) {
          const { value, done } = await iterator.next();
          if (done) return finish(controller, { type: "done" });
          if (value) return send(controller, { type: "delta", text: value });
        }
      } catch (error) {
        finish(controller, { type: "error", code: toErrorCode(error) });
      }
    },
    async cancel() {
      if (finished) return;
      finished = true;
      await iterator.return?.();
    },
  });
}

/** A stream containing a single complete reply (used for fixed safety responses). */
export function createTextEventStream(text: string): ReadableStream<Uint8Array> {
  async function* once() {
    yield text;
  }
  return createEventStream(once());
}

function parseEvent(line: string): StreamEvent {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    throw new StreamError("interrupted");
  }
  if (typeof data === "object" && data !== null) {
    const event = data as Record<string, unknown>;
    if (event.type === "delta" && typeof event.text === "string") {
      return { type: "delta", text: event.text };
    }
    if (event.type === "done") return { type: "done" };
    if (event.type === "error") {
      return { type: "error", code: isChatErrorCode(event.code) ? event.code : "upstream_error" };
    }
  }
  throw new StreamError("interrupted");
}

/**
 * Reads an NDJSON event stream, calling `onDelta` for each text piece.
 * Resolves with the full text once a `done` event arrives. Throws a
 * `StreamError` for server-reported errors or if the stream ends without
 * `done`. Errors from the underlying reader (e.g. an abort) are rethrown.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  // Returns true once the stream reports completion.
  const handleLine = (line: string): boolean => {
    if (line.trim() === "") return false;
    const event = parseEvent(line);
    if (event.type === "delta") {
      fullText += event.text;
      onDelta(event.text);
      return false;
    }
    if (event.type === "error") throw new StreamError(event.code);
    return true;
  };

  let completed = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // `stream: true` keeps incomplete multi-byte sequences for the next chunk.
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (handleLine(line)) {
          completed = true;
          return fullText;
        }
      }
    }

    buffer += decoder.decode();
    if (handleLine(buffer)) {
      completed = true;
      return fullText;
    }
    throw new StreamError("interrupted");
  } finally {
    if (completed) {
      reader.cancel().catch(() => {});
    } else {
      reader.releaseLock();
    }
  }
}
