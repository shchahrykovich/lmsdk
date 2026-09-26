import { env } from "cloudflare:test";
import app from "../../../worker/index";

export const testEnv = {
  ...env,
  ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "true",
  BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
};

export async function signUpAndGetCookie(email: string): Promise<string> {
  const response = await app.request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123", name: "Test User" }),
    },
    testEnv
  );

  if (response.status !== 200) {
    throw new Error(`Sign-up failed with ${response.status}: ${await response.text()}`);
  }

  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function requestWithCookie(path: string, cookie: string | undefined, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  headers.set("Origin", "http://localhost");
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  return app.request(path, { ...init, headers }, testEnv);
}
