import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TenantService } from "../../../../worker/services/tenant.service";
import { applyMigrations } from "../../helpers/db-setup";

describe("TenantService - getTenantById", () => {
  let tenantService: TenantService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    tenantService = new TenantService(db);
  });

  it("should return tenant when ID exists", async () => {
    const created = await tenantService.createTenant();

    const tenant = await tenantService.getTenantById(created.id);

    expect(tenant).toBeDefined();
    expect(tenant?.id).toBe(created.id);
    expect(tenant?.isActive).toBe(true);
    expect(tenant?.createdAt).toBeDefined();
    expect(tenant?.updatedAt).toBeDefined();

    // Verify fields match
    expect(tenant?.createdAt.getTime()).toBe(created.createdAt.getTime());
    expect(tenant?.updatedAt.getTime()).toBe(created.updatedAt.getTime());
  });

  it("should return undefined when tenant does not exist", async () => {
    const tenant = await tenantService.getTenantById(99999);

    expect(tenant).toBeUndefined();
  });

  it("should return correct tenant when multiple tenants exist", async () => {
    const tenant1 = await tenantService.createTenant();
    const tenant2 = await tenantService.createTenant();
    const tenant3 = await tenantService.createTenant();

    // Get each tenant by ID
    const retrieved1 = await tenantService.getTenantById(tenant1.id);
    const retrieved2 = await tenantService.getTenantById(tenant2.id);
    const retrieved3 = await tenantService.getTenantById(tenant3.id);

    expect(retrieved1?.id).toBe(tenant1.id);
    expect(retrieved2?.id).toBe(tenant2.id);
    expect(retrieved3?.id).toBe(tenant3.id);

    // Verify they are different tenants
    expect(retrieved1?.id).not.toBe(retrieved2?.id);
    expect(retrieved1?.id).not.toBe(retrieved3?.id);
    expect(retrieved2?.id).not.toBe(retrieved3?.id);
  });

  it("should return tenant even if inactive", async () => {
    const created = await tenantService.createTenant();

    // Deactivate the tenant
    await tenantService.deactivateTenant(created.id);

    // Should still be able to get it
    const tenant = await tenantService.getTenantById(created.id);

    expect(tenant).toBeDefined();
    expect(tenant?.id).toBe(created.id);
    expect(tenant?.isActive).toBe(false);
  });

  it("should handle ID 0 correctly", async () => {
    const tenant = await tenantService.getTenantById(0);

    expect(tenant).toBeUndefined();
  });

  it("should handle negative IDs correctly", async () => {
    const tenant = await tenantService.getTenantById(-1);

    expect(tenant).toBeUndefined();
  });
});
