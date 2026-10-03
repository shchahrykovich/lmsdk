import { concatStreams, readChunks } from "./streams";

const MULTIPART_PART_BYTES = 10 * 1024 * 1024;
const DELETE_PAGE = 1000;

export interface PartSegment {
  partKey: string;
  offset: number;
  length: number;
}

export interface BatchLocation {
  tenantId: number;
  batchId: number;
}

const prefix = ({ tenantId, batchId }: BatchLocation): string => `batches/${tenantId}/${batchId}/`;

export class BatchFilesRepository {
  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  partKey(location: BatchLocation, partKey: string): string {
    return `${prefix(location)}parts/${partKey}.jsonl`;
  }

  resultKey(location: BatchLocation, itemId: number): string {
    return `${prefix(location)}results/${itemId}.json`;
  }

  rawKey(location: BatchLocation, shardSeq: number, kind: string): string {
    return `${prefix(location)}raw/${shardSeq}-${kind}.jsonl`;
  }

  async putPart(location: BatchLocation, partKey: string, content: string): Promise<void> {
    await this.bucket.put(this.partKey(location, partKey), content, {
      httpMetadata: { contentType: "application/jsonl" },
    });
  }

  async deletePart(location: BatchLocation, partKey: string): Promise<void> {
    await this.bucket.delete(this.partKey(location, partKey));
  }

  async readPartRange(location: BatchLocation, partKey: string, offset: number, length: number): Promise<string> {
    const object = await this.bucket.get(this.partKey(location, partKey), { range: { offset, length } });
    if (!object) {
      throw new Error(`Batch part ${partKey} is missing`);
    }
    return await object.text();
  }

  openSegments(location: BatchLocation, segments: PartSegment[]): ReadableStream<Uint8Array> {
    return concatStreams(
      segments.map((segment) => async () => {
        const object = await this.bucket.get(this.partKey(location, segment.partKey), {
          range: { offset: segment.offset, length: segment.length },
        });
        if (!object) {
          throw new Error(`Batch part ${segment.partKey} is missing`);
        }
        return object.body;
      })
    );
  }

  async putResult(location: BatchLocation, itemId: number, value: unknown): Promise<void> {
    await this.bucket.put(this.resultKey(location, itemId), JSON.stringify(value), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  async getResult(location: BatchLocation, itemId: number): Promise<unknown> {
    const object = await this.bucket.get(this.resultKey(location, itemId));
    return object ? ((await object.json()) as unknown) : null;
  }

  async putRaw(key: string, body: ReadableStream<Uint8Array>, length?: number): Promise<number> {
    if (length !== undefined) {
      const { readable, writable } = new FixedLengthStream(length);
      const [, object] = await Promise.all([body.pipeTo(writable), this.bucket.put(key, readable)]);
      return object?.size ?? length;
    }
    return await this.putRawMultipart(key, body);
  }

  async rawSize(key: string): Promise<number> {
    const head = await this.bucket.head(key);
    return head?.size ?? 0;
  }

  async readRawRange(key: string, offset: number, length: number): Promise<Uint8Array> {
    const object = await this.bucket.get(key, { range: { offset, length } });
    if (!object) {
      throw new Error(`Raw result file ${key} is missing`);
    }
    return new Uint8Array(await object.arrayBuffer());
  }

  async deleteAll(location: BatchLocation): Promise<number> {
    let deleted = 0;
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix: prefix(location), cursor, limit: DELETE_PAGE });
      if (page.objects.length > 0) {
        await this.bucket.delete(page.objects.map((object) => object.key));
        deleted += page.objects.length;
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return deleted;
  }

  private async putRawMultipart(key: string, body: ReadableStream<Uint8Array>): Promise<number> {
    const upload = await this.bucket.createMultipartUpload(key);
    const parts: R2UploadedPart[] = [];
    let total = 0;
    try {
      for await (const chunk of readChunks(body, MULTIPART_PART_BYTES)) {
        parts.push(await upload.uploadPart(parts.length + 1, chunk));
        total += chunk.byteLength;
      }
      if (parts.length === 0) {
        await upload.abort();
        await this.bucket.put(key, "");
        return 0;
      }
      await upload.complete(parts);
      return total;
    } catch (error) {
      await upload.abort();
      throw error;
    }
  }
}
