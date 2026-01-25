import path from "node:path";
import {
  buildPagesASSETSBinding,
  defineWorkersProject,
} from "@cloudflare/vitest-pool-workers/config";
import { readFileSync, readdirSync } from "node:fs";

const pkg = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);

const drizzlePath = path.join(__dirname, "drizzle");
const migrationFiles = readdirSync(drizzlePath)
  .filter(f => f.endsWith('.sql'))
  .sort();

const migrations: Record<string, string> = {};
for (const file of migrationFiles) {
  const content = readFileSync(path.join(drizzlePath, file), 'utf-8');
  migrations[file] = content;
}

export default defineWorkersProject(async () => {
  const assetsPath = path.join(__dirname, "public");

  return {
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version),
			__DB_MIGRATIONS__: JSON.stringify(migrations),
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
