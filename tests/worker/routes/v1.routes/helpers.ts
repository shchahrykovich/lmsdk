import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { randomBytes } from "node:crypto";
import app from "../../../../worker/index";
import { createAuth } from "../../../../auth";
import { user } from "../../../../worker/db/schema";
import { applyMigrations } from "../../helpers/db-setup";

const executionCtx = {
  waitUntil: (promise: Promise<unknown>) => promise,
  passThroughOnException: () => {},
};

export const requestWithApiKey = (
  path: string,
  apiKey?: string,
  init: RequestInit = {}
) => {
  const headers = new Headers(init.headers ?? {});
  if (apiKey !== undefined) {
    headers.set("x-api-key", apiKey);
  }

  return app.request(path, { ...init, headers }, {
    DB: env.DB,
    executionCtx: executionCtx as any,
  });
};

export const requestJsonWithApiKey = (
  path: string,
  apiKey: string | undefined,
  jsonBody: unknown,
  init: RequestInit = {}
) => {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (apiKey !== undefined) {
    headers.set("x-api-key", apiKey);
  }

  return app.request(
    path,
    {
      method: init.method ?? "POST",
      ...init,
      headers,
      body: JSON.stringify(jsonBody),
    },
    {
      DB: env.DB,
      executionCtx: executionCtx as any,
    }
  );
};

export const setupApiKeyUser = async (tenantId = 1) => {
  await applyMigrations();

  const db = drizzle(env.DB);
  const userId = `user_${randomBytes(8).toString("hex")}`;
  const userEmail = `test_${randomBytes(4).toString("hex")}@example.com`;

  await db.insert(user).values({
    id: userId,
    email: userEmail,
    name: "Test User",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId,
  });

  const auth = createAuth(env);
  const createKeyResponse = await auth.api.createApiKey({
    body: {
      userId: userId,
      name: "Test API Key",
    },
  });

  return {
    testUser: {
      id: userId,
      email: userEmail,
      name: "Test User",
    },
    testApiKey: createKeyResponse.key,
  };
};
