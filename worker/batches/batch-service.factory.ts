import { drizzle } from "drizzle-orm/d1";
import { BatchService } from "./batch.service";
import { BatchFilesRepository } from "./batch-files.repository";
import { createBatchAdapterFactory } from "./adapters/adapter-factory";
import { providerConfigFromEnv } from "../providers/provider-factory";

export function batchServiceFor(env: Env): BatchService {
  return new BatchService({
    db: drizzle(env.DB),
    files: new BatchFilesRepository(env.PRIVATE_FILES),
    adapters: createBatchAdapterFactory(providerConfigFromEnv(env)),
    startWorkflow: async (id, params) => {
      await env.BATCH_WORKFLOW.create({ id, params });
    },
    stopWorkflow: async (id) => {
      await (await env.BATCH_WORKFLOW.get(id)).terminate();
    },
    workflowStatus: async (id) => (await (await env.BATCH_WORKFLOW.get(id)).status()).status,
  });
}
