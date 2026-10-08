import { env } from "cloudflare:test";
import app from "../../../../../worker/index";
import { MODEL, validBody } from "./helpers";

export type Operation = {
  method: string;
  path: string;
  hasPathParams: boolean;
  spec: {
    tags?: string[];
    security?: unknown[];
    description?: string;
    requestBody?: { content: { "application/json": { schema: Record<string, unknown> } } };
    responses: Record<string, unknown>;
  };
};

export type OpenApiDocument = { paths: Record<string, Record<string, Operation["spec"]>> };

export async function fetchOpenApi(): Promise<OpenApiDocument> {
  const res = await app.request("/api/openapi.json", {}, env);
  return await res.json<OpenApiDocument>();
}

export async function manageOperations(): Promise<Operation[]> {
  const doc = await fetchOpenApi();
  return Object.entries(doc.paths)
    .filter(([path]) => path.startsWith("/api/v1/manage"))
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, spec]) => ({
        method: method.toUpperCase(),
        path,
        hasPathParams: path.includes("{"),
        spec,
      }))
    );
}

export function fillPath(path: string, values: Record<string, string | number>): string {
  return path
    .replace("/api/v1/manage", "")
    .replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? name));
}

export const validBodies: Record<string, unknown> = {
  "POST /api/v1/manage/projects": { name: "New", slug: "new-project" },
  "POST /api/v1/manage/projects/{project}/prompts": {
    name: "New prompt",
    slug: "new-prompt",
    provider: "openai",
    model: MODEL,
    body: validBody,
  },
  "POST /api/v1/manage/projects/{project}/prompts/{prompt}/versions": { activate: true },
  "PATCH /api/v1/manage/projects/{project}/prompts/{prompt}": { name: "Renamed prompt" },
  "PUT /api/v1/manage/projects/{project}/prompts/{prompt}/active-version": { version: 1 },
  "POST /api/v1/manage/projects/{project}/datasets": { name: "New dataset" },
  "POST /api/v1/manage/projects/{project}/datasets/{dataset}/records": { records: [{ ticket: "x" }] },
  "POST /api/v1/manage/projects/{project}/evaluations": {
    name: "New evaluation",
    dataset: "tickets",
    prompts: [{ prompt: "classifier", version: 1 }],
  },
  "PATCH /api/v1/manage/projects/{project}/evaluations/{evaluation}": { summary: "v2 wins on short tickets" },
  "PUT /api/v1/manage/projects/{project}/evaluations/{evaluation}/comparisons": {
    recordId: 1,
    leftVersionId: 1,
    rightVersionId: 2,
    description: "Right is shorter",
    score: 1,
  },
  "POST /api/v1/manage/projects/{project}/batches/{batch}/cancel": {},
  "POST /api/v1/manage/projects/{project}/batches/{batch}/finish": {},
};

export const bodyFor = (operation: Operation): unknown => validBodies[`${operation.method} ${operation.path}`];
