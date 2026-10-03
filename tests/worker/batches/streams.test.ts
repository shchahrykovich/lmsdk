import { describe, it, expect } from "vitest";
import { completeLines, concatStreams, readChunks, readLines } from "../../../worker/batches/streams";
import { parseItemKey, itemKey } from "../../../worker/batches/batch-item-key";

const bytes = (text: string) => new TextEncoder().encode(text);
const stream = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      parts.forEach((part) => controller.enqueue(bytes(part)));
      controller.close();
    },
  });

describe("completeLines", () => {
  it("returns only complete lines and the bytes they used", () => {
    expect(completeLines(bytes('{"a":1}\n{"b":2}\n{"c"'), false)).toEqual({ lines: ['{"a":1}', '{"b":2}'], consumed: 16 });
  });

  it("returns the last line without a newline at the end of the file", () => {
    expect(completeLines(bytes("x\ny"), true)).toEqual({ lines: ["x", "y"], consumed: 3 });
  });

  it("stops at the line limit", () => {
    expect(completeLines(bytes("a\nb\nc\n"), false, 2)).toEqual({ lines: ["a", "b"], consumed: 4 });
  });

  it("counts bytes, not characters, for text outside ASCII", () => {
    expect(completeLines(bytes("ü\nz"), false)).toEqual({ lines: ["ü"], consumed: 3 });
  });
});

describe("stream helpers", () => {
  it("cuts a stream into chunks of a fixed size and a smaller last chunk", async () => {
    const sizes: number[] = [];
    for await (const chunk of readChunks(stream("abcd", "efghi", "j"), 4)) sizes.push(chunk.byteLength);

    expect(sizes).toEqual([4, 4, 2]);
  });

  it("joins streams in order and reads them line by line", async () => {
    const joined = concatStreams([async () => stream("a\nb"), async () => stream("c\n"), async () => stream("d")]);
    const lines: string[] = [];
    for await (const line of readLines(joined)) lines.push(line);

    expect(lines).toEqual(["a", "bc", "d"]);
  });
});

describe("item keys", () => {
  it("round-trips a part key and a line index", () => {
    expect(parseItemKey(itemKey({ partKey: "abc123", lineIndex: 42 }))).toEqual({ partKey: "abc123", lineIndex: 42 });
  });

  it.each([["nodash"], ["-5"], ["abc-x"]])("rejects %s", (key) => {
    expect(parseItemKey(key)).toBeNull();
  });
});
