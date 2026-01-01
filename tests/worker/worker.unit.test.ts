import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../worker";

// For correctly-typed Request
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Worker Unit Tests", () => {
  describe("GET /* (catch-all)", () => {
    it("should return 'Frontend route' for root path", async () => {
      const request = new IncomingRequest("http://example.com/");
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Frontend route");
    });

    it("should return 'Frontend route' for any non-api path", async () => {
      const request = new IncomingRequest("http://example.com/some/random/path");
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Frontend route");
    });
  });

  describe("Content-Type headers", () => {
    it("should return text content-type for frontend routes", async () => {
      const request = new IncomingRequest("http://example.com/");
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.headers.get("content-type")).toContain("text/plain");
    });
  });
});
