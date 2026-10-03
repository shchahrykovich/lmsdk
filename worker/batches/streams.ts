const encoder = new TextEncoder();

export const utf8Length = (text: string): number => encoder.encode(text).byteLength;

export function concatStreams(open: (() => Promise<ReadableStream<Uint8Array>>)[]): ReadableStream<Uint8Array> {
  let index = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (index < open.length) {
        reader ??= (await open[index]!()).getReader();
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        reader = null;
        index++;
      }
      controller.close();
    },
    async cancel(reason) {
      await reader?.cancel(reason);
    },
  });
}

export function streamFromStrings(chunks: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value));
    },
  });
}

export async function* readChunks(
  stream: ReadableStream<Uint8Array>,
  chunkBytes: number
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  let buffer = new Uint8Array(chunkBytes);
  let filled = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let offset = 0;
    while (offset < value.byteLength) {
      const take = Math.min(chunkBytes - filled, value.byteLength - offset);
      buffer.set(value.subarray(offset, offset + take), filled);
      filled += take;
      offset += take;
      if (filled === chunkBytes) {
        yield buffer;
        buffer = new Uint8Array(chunkBytes);
        filled = 0;
      }
    }
  }
  if (filled > 0) {
    yield buffer.subarray(0, filled);
  }
}

export async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline).trim();
      if (line) yield line;
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  }
  pending += decoder.decode();
  if (pending.trim()) yield pending.trim();
}

export function completeLines(
  bytes: Uint8Array,
  isLastChunk: boolean,
  maxLines: number = Number.POSITIVE_INFINITY
): { lines: string[]; consumed: number } {
  const decoder = new TextDecoder();
  const lines: string[] = [];
  let start = 0;
  while (start < bytes.byteLength && lines.length < maxLines) {
    const newline = bytes.indexOf(10, start);
    if (newline < 0 && !isLastChunk) break;
    const end = newline < 0 ? bytes.byteLength : newline + 1;
    const line = decoder.decode(bytes.subarray(start, end)).trim();
    if (line) lines.push(line);
    start = end;
  }
  return { lines, consumed: start };
}
