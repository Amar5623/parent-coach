import Groq from "groq-sdk";
import type { ChatErrorCode } from "@/lib/types";
import type { LlmMessage } from "./coach";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/** Streams reply text for the given messages. Rejects with `ProviderError`. */
export type StreamCompletion = (
  messages: LlmMessage[],
  signal: AbortSignal,
) => Promise<AsyncIterable<string>>;

export class ProviderError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    options?: { cause?: unknown },
  ) {
    super(`Provider error: ${code}`, options);
    this.name = "ProviderError";
  }
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Groq.APIConnectionTimeoutError) return new ProviderError("timeout", { cause: error });
  if (error instanceof Groq.RateLimitError) return new ProviderError("rate_limited", { cause: error });
  if (error instanceof Groq.AuthenticationError || error instanceof Groq.PermissionDeniedError) {
    return new ProviderError("not_configured", { cause: error });
  }
  return new ProviderError("upstream_error", { cause: error });
}

async function* contentDeltas(
  stream: AsyncIterable<Groq.Chat.ChatCompletionChunk>,
): AsyncGenerator<string> {
  try {
    for await (const chunk of stream) {
      // Only `content` is forwarded; reasoning output (if any) never reaches the user.
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  } catch (error) {
    throw toProviderError(error);
  }
}

export const streamGroqCompletion: StreamCompletion = async (messages, signal) => {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new ProviderError("not_configured");

  const model = getGroqModel();
  const client = new Groq({ apiKey, timeout: 20_000, maxRetries: 1 });
  const isReasoningModel = model.startsWith("openai/gpt-oss");

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages,
        stream: true,
        temperature: 0.4,
        max_completion_tokens: 1024,
        // gpt-oss models think before answering; keep that short for snappy replies.
        ...(isReasoningModel ? { reasoning_effort: "low" as const, include_reasoning: false } : {}),
      },
      { signal },
    );
    return contentDeltas(stream);
  } catch (error) {
    throw toProviderError(error);
  }
};
