import { describe, expect, it, vi } from "vitest";
import {
  encoder,
  failingStream,
  readAllText,
  splitBytes,
  streamFromChunks,
  textSource,
} from "@/test/streams";
import {
  createEventStream,
  createTextEventStream,
  encodeEvent,
  readEventStream,
  StreamError,
} from "./stream";

const URDU = "آپ کا بچہ ضد کر رہا ہے؟ ۱۔ پرسکون رہیں۔";

function ndjson(...events: Parameters<typeof encodeEvent>[0][]): Uint8Array {
  return encoder.encode(events.map(encodeEvent).join(""));
}

describe("createEventStream (server side)", () => {
  it("emits one delta per piece and a final done event", async () => {
    const text = await readAllText(createEventStream(textSource(["Hello", "", " there"])));
    expect(text.trim().split("\n").map((l) => JSON.parse(l))).toEqual([
      { type: "delta", text: "Hello" },
      { type: "delta", text: " there" },
      { type: "done" },
    ]);
  });

  it("encodes Urdu as raw UTF-8 without mangling it", async () => {
    const text = await readAllText(createEventStream(textSource([URDU])));
    expect(JSON.parse(text.split("\n")[0])).toEqual({ type: "delta", text: URDU });
  });

  it("turns a source failure into an error event instead of a silent end", async () => {
    const toCode = vi.fn(() => "rate_limited" as const);
    const text = await readAllText(createEventStream(textSource(["partial"], new Error("boom")), toCode));
    const events = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(events).toEqual([
      { type: "delta", text: "partial" },
      { type: "error", code: "rate_limited" },
    ]);
    expect(toCode).toHaveBeenCalledOnce();
  });

  it("stops the source when the consumer cancels", async () => {
    let finished = false;
    async function* source() {
      try {
        yield "a";
        yield "b";
        yield "c";
      } finally {
        finished = true;
      }
    }
    const reader = createEventStream(source()).getReader();
    await reader.read();
    await reader.cancel();
    expect(finished).toBe(true);
  });

  it("creates a single-message stream for fixed replies", async () => {
    let received = "";
    const result = await readEventStream(createTextEventStream(URDU), (d) => (received += d));
    expect(result).toBe(URDU);
    expect(received).toBe(URDU);
  });
});

describe("readEventStream (client side)", () => {
  it("reassembles Urdu characters split across chunk boundaries", async () => {
    const bytes = ndjson({ type: "delta", text: URDU }, { type: "delta", text: " دوسرا" }, { type: "done" });
    // Every split size from 1 byte upward hits the middle of 2-byte Urdu letters.
    for (const size of [1, 2, 3, 5, 7]) {
      const deltas: string[] = [];
      const text = await readEventStream(streamFromChunks(splitBytes(bytes, size)), (d) => deltas.push(d));
      expect(text).toBe(`${URDU} دوسرا`);
      expect(text).not.toContain("�");
      expect(deltas).toEqual([URDU, " دوسرا"]);
    }
  });

  it("handles a split exactly inside a single Urdu letter", async () => {
    const bytes = ndjson({ type: "delta", text: "ب" }, { type: "done" });
    const letterStart = bytes.indexOf(0xd8); // first byte of the 2-byte "ب"
    const chunks = [bytes.slice(0, letterStart + 1), bytes.slice(letterStart + 1)];
    await expect(readEventStream(streamFromChunks(chunks), () => {})).resolves.toBe("ب");
  });

  it("preserves logical character order (no reversal)", async () => {
    const text = await readEventStream(
      streamFromChunks([ndjson({ type: "delta", text: "سل" }, { type: "delta", text: "ام" }, { type: "done" })]),
      () => {},
    );
    expect(Array.from(text)).toEqual(["س", "ل", "ا", "م"]);
  });

  it("throws the server's error code when the stream reports a failure", async () => {
    const deltas: string[] = [];
    const stream = streamFromChunks([ndjson({ type: "delta", text: "Partial" }, { type: "error", code: "timeout" })]);
    const error = await readEventStream(stream, (d) => deltas.push(d)).catch((e) => e);
    expect(error).toBeInstanceOf(StreamError);
    expect(error.code).toBe("timeout");
    expect(deltas).toEqual(["Partial"]);
  });

  it("treats a stream that ends without `done` as interrupted", async () => {
    const stream = streamFromChunks([ndjson({ type: "delta", text: "Half a reply" })]);
    const error = await readEventStream(stream, () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(StreamError);
    expect(error.code).toBe("interrupted");
  });

  it("treats a truncated final line as interrupted", async () => {
    const bytes = ndjson({ type: "delta", text: "Hi" }, { type: "done" });
    const stream = streamFromChunks([bytes.slice(0, bytes.length - 5)]);
    await expect(readEventStream(stream, () => {})).rejects.toMatchObject({ code: "interrupted" });
  });

  it("rejects malformed events", async () => {
    const stream = streamFromChunks([encoder.encode('{"type":"surprise"}\n')]);
    await expect(readEventStream(stream, () => {})).rejects.toMatchObject({ code: "interrupted" });
  });

  it("maps unknown error codes to upstream_error", async () => {
    const stream = streamFromChunks([encoder.encode('{"type":"error","code":"weird"}\n')]);
    await expect(readEventStream(stream, () => {})).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("rethrows transport failures (e.g. a dropped connection)", async () => {
    const stream = failingStream([ndjson({ type: "delta", text: "Hi" })]);
    await expect(readEventStream(stream, () => {})).rejects.toThrow("terminated");
  });

  it("round-trips through the server encoder end to end", async () => {
    const pieces = ["میرا ", "مشورہ", " یہ ہے:", "\n۱۔ ", "وقت دیں۔"];
    const text = await readEventStream(createEventStream(textSource(pieces)), () => {});
    expect(text).toBe(pieces.join(""));
  });
});
