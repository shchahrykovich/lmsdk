import type { DrizzleD1Database } from "drizzle-orm/d1";
import { EntityId } from "../shared/entity-id";
import { ProjectId } from "../shared/project-id";
import { BatchRepository } from "./batch.repository";
import { BatchFilesRepository } from "./batch-files.repository";

export const RETENTION_BATCHES_PER_RUN = 25;

export class BatchRetentionService {
  private readonly batches: BatchRepository;
  private readonly files: BatchFilesRepository;

  constructor(db: DrizzleD1Database, files: BatchFilesRepository) {
    this.batches = new BatchRepository(db);
    this.files = files;
  }

  async purgeExpired(now: Date = new Date(), limit: number = RETENTION_BATCHES_PER_RUN): Promise<number> {
    const expired = await this.batches.findExpired(now, limit);
    for (const batch of expired) {
      await this.files.deleteAll({ tenantId: batch.tenantId, batchId: batch.id });
      await this.batches.deleteBatch(new EntityId(batch.id, new ProjectId(batch.projectId, batch.tenantId, "retention")));
    }
    return expired.length;
  }
}
