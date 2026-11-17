import { MAX_REQUEST_BODY_CHARS } from "@/lib/limits";
import { createEventStream, createTextEventStream } from "@/lib/stream";
import type { ChatErrorCode } from "@/lib/types";
import { validateChatRequest } from "@/lib/validation";
import { planCoachReply } from "./coach";
import { ProviderError, type StreamCompletion } from "./groq";
import { clientKey, type RateLimiter } from "./rate-limit";

/** Upper bound for a whole reply, including streaming. */
const DEFAULT_TOTAL_TIMEOUT_MS = 60_000;

const STATUS_BY_CODE: Record<ChatErrorCode, number> = {
  invalid_request: 400,
  payload_too_large: 413,
  rate_limited: 429,
  daily_limit: 429,
  not_configured: 500,
  upstream_error: 502,
  timeout: 504,
  network: 502,
  interrupted: 502,
};

const STREAM_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  "X-Accel-Buffering": "no",
};

function errorResponse(code: ChatErrorCode, message?: string, headers: Record<string, string> = {}): Response {
  return Response.json(
    { error: code, ...(message ? { message } : {}) },
    { status: STATUS_BY_CODE[code], headers: { "Cache-Control": "no-store", ...headers } },
  );
}

/** Error name and HTTP status only – never message text that could echo user content. */
function describeError(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (!(cause instanceof Error)) return "unknown";
  const status = (cause as { status?: unknown }).status;
  return typeof status === "number" ? `${cause.name} ${status}` : cause.name;
}

export interface ChatHandlerDeps {
  streamCompletion: StreamCompletion;
  totalTimeoutMs?: number;
  /** Limits model calls only; fixed safety replies are never rate limited. */
  rateLimiter?: RateLimiter;
}

/**
 * Handles POST /api/chat: validates the payload, runs the safety screen, and
 * streams the reply as NDJSON. Emergencies get the fixed safety reply before
 * any rate limit is checked, so a parent in crisis is never told to wait. Kept separate from the route file so it can be
 * tested with a fake provider.
 */
export async function handleChatRequest(request: Request, deps: ChatHandlerDeps): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BODY_CHARS * 4) return errorResponse("payload_too_large");

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return errorResponse("invalid_request", "Could not read request body.");
  }
  if (raw.length > MAX_REQUEST_BODY_CHARS) return errorResponse("payload_too_large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse("invalid_request", "Body must be valid JSON.");
  }

  const validation = validateChatRequest(body);
  if (!validation.ok) return errorResponse("invalid_request", validation.error);

  const plan = planCoachReply(validation.value);

  if (plan.kind === "safety") {
    return new Response(createTextEventStream(plan.text), {
      headers: { ...STREAM_HEADERS, "X-Coach-Response": "safety" },
    });
  }

  const limit = deps.rateLimiter?.check(clientKey(request));
  if (limit && !limit.ok) {
    return errorResponse(limit.code, undefined, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const timeout = AbortSignal.timeout(deps.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);
  const signal = AbortSignal.any([request.signal, timeout]);

  const toErrorCode = (error: unknown): ChatErrorCode => {
    const code: ChatErrorCode = timeout.aborted
      ? "timeout"
      : error instanceof ProviderError
        ? error.code
        : "upstream_error";
    if (!request.signal.aborted) console.error(`[chat] reply failed: ${code} (${describeError(error)})`);
    return code;
  };

  let source: AsyncIterable<string>;
  try {
    source = await deps.streamCompletion(plan.messages, signal);
  } catch (error) {
    return errorResponse(toErrorCode(error));
  }

  return new Response(createEventStream(source, toErrorCode), {
    headers: { ...STREAM_HEADERS, "X-Coach-Response": "model" },
  });
}
