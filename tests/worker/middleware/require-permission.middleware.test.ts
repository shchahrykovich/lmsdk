import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { requireApiKey } from "../../../worker/middleware/apikey.middleware";
import { requireManagePermission } from "../../../worker/middleware/require-permission.middleware";
import { createAuth } from "../../../auth";
import { env } from "cloudflare:test";
import type { HonoEnv } from "../../../worker/routes/app";
import { setupApiKeyUser, createApiKeyForUser } from "../routes/v1.routes/helpers";

const buildApp = () => {
  const app = new Hono<HonoEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createAuth(c.env));
    await next();
  });
  app.use("/manage/*", requireApiKey);
  app.use("/manage/*", requireManagePermission);
  app.get("/manage/thing", (c) => c.json({ ok: true }));
  app.post("/manage/thing", (c) => c.json({ ok: true }));
  app.put("/manage/thing", (c) => c.json({ ok: true }));
  app.delete("/manage/thing", (c) => c.json({ ok: true }));
  return app;
};

const call = (app: Hono<HonoEnv>, method: string, key: string) =>
  app.request("/manage/thing", { method, headers: { "x-api-key": key } }, env);

describe("requireManagePermission middleware", () => {
  let oldKey: string;
  let readKey: string;
  let writeKey: string;

  beforeEach(async () => {
    const setup = await setupApiKeyUser(1);
    oldKey = setup.testApiKey;
    readKey = await createApiKeyForUser(setup.testUser.id, { manage: ["read"] });
    writeKey = await createApiKeyForUser(setup.testUser.id, { manage: ["read", "write"] });
  });

  it("gives 403 to a key without permissions on every method", async () => {
    const app = buildApp();

    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const res = await call(app, method, oldKey);
      expect(res.status, method).toBe(403);
    }
  });

  it("lets a read key GET and blocks every write method", async () => {
    const app = buildApp();

    expect((await call(app, "GET", readKey)).status).toBe(200);
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await call(app, method, readKey);
      expect(res.status, method).toBe(403);
      expect(await res.json()).toEqual({ error: "This API key does not have the manage:write permission" });
    }
  });

  it("lets a write key use every method", async () => {
    const app = buildApp();

    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const res = await call(app, method, writeKey);
      expect(res.status, method).toBe(200);
    }
  });

  it("keeps 401 for a missing key", async () => {
    const app = buildApp();

    const res = await app.request("/manage/thing", {}, env);

    expect(res.status).toBe(401);
  });
});
