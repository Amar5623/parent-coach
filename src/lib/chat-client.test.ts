import { describe, expect, it, vi } from "vitest";
import { encoder, failingStream, splitBytes, streamFromChunks } from "@/test/streams";
import { requestCoachReply } from "./chat-client";
import { encodeEvent } from "./stream";

const messages = [{ role: "user" as const, content: "Hi" }];

function streamResponse(body: ReadableStream<Uint8Array>) {
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}

function call(fetchImpl: typeof fetch, signal = new AbortController().signal) {
  const deltas: string[] = [];
  const promise = requestCoachReply({ language: "ur", messages, signal, onDelta: (d) => deltas.push(d), fetchImpl });
  return { promise, deltas };
}

describe("requestCoachReply", () => {
  it("posts the language and messages and streams the reply", async () => {
    const bytes = encoder.encode(
      encodeEvent({ type: "delta", text: "سلام" }) + encodeEvent({ type: "delta", text: "!" }) + encodeEvent({ type: "done" }),
    );
    const fetchImpl = vi.fn(async () => streamResponse(streamFromChunks(splitBytes(bytes, 3))));
    const { promise, deltas } = call(fetchImpl);

    await expect(promise).resolves.toEqual({ status: "done", text: "سلام!" });
    expect(deltas).toEqual(["سلام", "!"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chat");
    expect(JSON.parse(init.body as string)).toEqual({ language: "ur", messages });
  });

  it.each([
    [400, { error: "invalid_request" }, "invalid_request"],
    [429, { error: "rate_limited" }, "rate_limited"],
    [500, { error: "not_configured" }, "not_configured"],
    [504, "not json", "timeout"],
    [502, "not json", "upstream_error"],
    [413, null, "payload_too_large"],
  ])("maps HTTP %i responses to an error result", async (status, body, code) => {
    const fetchImpl = vi.fn(async () =>
      typeof body === "object" && body !== null ? Response.json(body, { status }) : new Response(body, { status }),
    );
    await expect(call(fetchImpl).promise).resolves.toEqual({ status: "error", text: "", code });
  });

  it("reports network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(call(fetchImpl).promise).resolves.toEqual({ status: "error", text: "", code: "network" });
  });

  it("keeps partial text but marks a mid-stream server error as an error", async () => {
    const bytes = encoder.encode(encodeEvent({ type: "delta", text: "Try this" }) + encodeEvent({ type: "error", code: "timeout" }));
    const fetchImpl = vi.fn(async () => streamResponse(streamFromChunks([bytes])));
    await expect(call(fetchImpl).promise).resolves.toEqual({ status: "error", text: "Try this", code: "timeout" });
  });

  it("marks a dropped connection as interrupted, never as done", async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse(failingStream([encoder.encode(encodeEvent({ type: "delta", text: "Half" }))])),
    );
    await expect(call(fetchImpl).promise).resolves.toEqual({ status: "error", text: "Half", code: "interrupted" });
  });

  it("marks a stream that closes without `done` as interrupted", async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse(streamFromChunks([encoder.encode(encodeEvent({ type: "delta", text: "Half" }))])),
    );
    await expect(call(fetchImpl).promise).resolves.toMatchObject({ status: "error", code: "interrupted" });
  });

  it("returns `stopped` with the partial text when the user cancels mid-stream", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        pull(c) {
          if (!sent) {
            sent = true;
            c.enqueue(encoder.encode(encodeEvent({ type: "delta", text: "Partial" })));
            return;
          }
          // Hang until aborted, like a slow model.
          return new Promise<void>((_, reject) =>
            init?.signal?.addEventListener("abort", () => {
              const error = new DOMException("Aborted", "AbortError");
              c.error(error);
              reject(error);
            }),
          );
        },
      });
      return streamResponse(body);
    });

    const deltas: string[] = [];
    const promise = requestCoachReply({
      language: "en",
      messages,
      signal: controller.signal,
      onDelta: (d) => {
        deltas.push(d);
        controller.abort();
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(promise).resolves.toEqual({ status: "stopped", text: "Partial" });
  });

  it("returns `stopped` when cancelled before the response arrives", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(call(fetchImpl, controller.signal).promise).resolves.toEqual({ status: "stopped", text: "" });
  });
});
