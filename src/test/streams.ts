/** Test helpers for building and draining byte streams. */

export function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
}

/** Splits bytes into fixed-size pieces (size 1 = every byte separately). */
export function splitBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

/** A stream that delivers the given chunks and then fails, like a dropped connection. */
export function failingStream(chunks: Uint8Array[], error = new TypeError("terminated")): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.error(error);
    },
  });
}

export async function readAllText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

export async function* textSource(pieces: string[], error?: Error): AsyncGenerator<string> {
  for (const piece of pieces) yield piece;
  if (error) throw error;
}

export const encoder = new TextEncoder();
