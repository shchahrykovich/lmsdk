import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../../../worker/projects/project.service";
import { ConflictError } from "../../../../worker/shared/errors";
import { applyMigrations } from "../../helpers/db-setup";

describe("ProjectService - createProject conflicts", () => {
  let service: ProjectService;

  beforeEach(async () => {
    await applyMigrations();
    service = new ProjectService(drizzle(env.DB));
  });

  it("throws ConflictError for a duplicate slug in the same tenant", async () => {
    await service.createProject({ name: "A", slug: "shared", tenantId: 1 });

    await expect(service.createProject({ name: "B", slug: "shared", tenantId: 1 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws ConflictError for a duplicate name in the same tenant", async () => {
    await service.createProject({ name: "Same", slug: "a", tenantId: 1 });

    await expect(service.createProject({ name: "Same", slug: "b", tenantId: 1 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows the same slug in another tenant", async () => {
    await service.createProject({ name: "A", slug: "shared", tenantId: 1 });

    await expect(service.createProject({ name: "A", slug: "shared", tenantId: 2 })).resolves.toBeDefined();
  });
});
