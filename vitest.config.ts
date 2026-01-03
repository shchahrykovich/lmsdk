import path from "node:path";
import {
  buildPagesASSETSBinding,
  defineWorkersProject,
} from "@cloudflare/vitest-pool-workers/config";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);

export default defineWorkersProject(async () => {
  const assetsPath = path.join(__dirname, "public");

  return {
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version),
		},
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
            kvNamespaces: {
              CACHE: 'test-cache',
            },
          },
        },
      },
    },
  };
});
