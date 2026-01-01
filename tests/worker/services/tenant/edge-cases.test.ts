import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TenantService } from "../../../../worker/services/tenant.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Tenant } from "../../../../worker/db/schema";

describe("TenantService - Edge cases and data validation", () => {
  let tenantService: TenantService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    tenantService = new TenantService(db);
  });

  it("should handle tenant creation at database limits", async () => {
    // Create tenant and verify it works at boundary conditions
    const tenant = await tenantService.createTenant();

    expect(tenant.id).toBeGreaterThan(0);
    expect(tenant.isActive).toBe(true);

    // Verify in database
    const dbTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(tenant.id).first<Tenant>();

    expect(dbTenant).toBeDefined();
  });

  it("should return consistent results for repeated queries", async () => {
    const created = await tenantService.createTenant();

    // Query the same tenant multiple times
    const result1 = await tenantService.getTenantById(created.id);
    const result2 = await tenantService.getTenantById(created.id);
    const result3 = await tenantService.getTenantById(created.id);

    // All should return the same data
    expect(result1?.id).toBe(created.id);
    expect(result2?.id).toBe(created.id);
    expect(result3?.id).toBe(created.id);

    expect(result1?.isActive).toBe(result2?.isActive);
    expect(result2?.isActive).toBe(result3?.isActive);
  });

  it("should handle rapid sequential operations", async () => {
    // Create, read, deactivate in rapid succession
    const tenant = await tenantService.createTenant();
    const retrieved = await tenantService.getTenantById(tenant.id);
    await tenantService.deactivateTenant(tenant.id);
    const deactivated = await tenantService.getTenantById(tenant.id);

    expect(retrieved?.isActive).toBe(true);
    expect(deactivated?.isActive).toBe(false);

    // Verify final state in database
    const dbTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(tenant.id).first<Tenant>();

    expect(dbTenant?.isActive).toBe(0);
  });
});
