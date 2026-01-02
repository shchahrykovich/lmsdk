import path from "node:path";
import {
  buildPagesASSETSBinding,
  defineWorkersProject,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(async () => {
  const assetsPath = path.join(__dirname, "public");

  return {
    test: {
      poolOptions: {
        workers: {
          singleWorker: true,
          main: "./worker/index.ts",
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            serviceBindings: {
              ASSETS: await buildPagesASSETSBinding(assetsPath),
            },
            d1Databases: {
              DB: 'test-db',
            },
            r2Buckets: {
              PRIVATE_FILES: 'test-private-files',
            },
            queueProducers: {
              NEW_LOGS: 'test-queue',
            },
          },
        },
      },
    },
  };
});
