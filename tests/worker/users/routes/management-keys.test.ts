import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../../helpers/db-setup";
import { requestWithCookie, signUpAndGetCookie } from "../../helpers/session";

type CreatedKey = {
  key: string;
  name: string;
  permissions: Record<string, string[]>;
  expiresAt: string | null;
};

const createKey = (cookie: string | undefined, body: unknown) =>
  requestWithCookie("/api/users/management-keys", cookie, {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/users/management-keys", () => {
  let cookie: string;

  beforeEach(async () => {
    await applyMigrations();
    cookie = await signUpAndGetCookie("owner@example.com");
  });

  it("returns 401 without a session", async () => {
    const res = await createKey(undefined, { name: "agent", access: "write" });

    expect(res.status).toBe(401);
  });

  it("creates a write key with read and write permissions and a 90 day expiry", async () => {
    const res = await createKey(cookie, { name: "agent", access: "write" });
    const body = await res.json<CreatedKey>();

    expect(res.status).toBe(201);
    expect(body.key).toMatch(/.{20,}/);
    expect(body.permissions).toEqual({ manage: ["read", "write"] });
    const days = (new Date(body.expiresAt!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);
  });

  it("creates a read key with only read permission and a custom expiry", async () => {
    const res = await createKey(cookie, { name: "reader", access: "read", expiresInDays: 7 });
    const body = await res.json<CreatedKey>();

    expect(res.status).toBe(201);
    expect(body.permissions).toEqual({ manage: ["read"] });
    const days = (new Date(body.expiresAt!).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it("stores the permissions on the apikey row", async () => {
    const res = await createKey(cookie, { name: "agent", access: "write" });
    const body = await res.json<CreatedKey>();

    const row = await env.DB.prepare("SELECT permissions FROM apikey WHERE name = ?")
      .bind("agent")
      .first<{ permissions: string }>();
    expect(res.status).toBe(201);
    expect(JSON.parse(row!.permissions)).toEqual(body.permissions);
  });

  it.each([
    [{ access: "write" }],
    [{ name: "", access: "write" }],
    [{ name: "agent", access: "admin" }],
    [{ name: "agent", access: "write", expiresInDays: 0 }],
    [{ name: "agent", access: "write", expiresInDays: 366 }],
  ])("returns 400 for an invalid body %j", async (body) => {
    const res = await createKey(cookie, body);

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/api-key/create (better-auth route used by the UI card)", () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  it("refuses permissions sent from the browser", async () => {
    const cookie = await signUpAndGetCookie("owner@example.com");

    const res = await requestWithCookie("/api/auth/api-key/create", cookie, {
      method: "POST",
      body: JSON.stringify({ name: "sneaky", permissions: { manage: ["read", "write"] } }),
    });

    expect(res.status).toBe(400);
    expect((await res.json<{ code: string }>()).code).toBe(
      "THE_PROPERTY_YOURE_TRYING_TO_SET_CAN_ONLY_BE_SET_FROM_THE_SERVER_AUTH_INSTANCE_ONLY"
    );
    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM apikey").first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  it("still creates a plain key from the browser, so the 400 above is about permissions", async () => {
    const cookie = await signUpAndGetCookie("owner@example.com");

    const res = await requestWithCookie("/api/auth/api-key/create", cookie, {
      method: "POST",
      body: JSON.stringify({ name: "plain" }),
    });

    expect(res.status).toBe(200);
  });
});
