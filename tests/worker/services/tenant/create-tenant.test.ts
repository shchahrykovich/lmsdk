import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TenantService } from "../../../../worker/services/tenant.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Tenant } from "../../../../worker/db/schema";

describe("TenantService - createTenant", () => {
  let tenantService: TenantService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    tenantService = new TenantService(db);
  });

  it("should create a new tenant with default active status", async () => {
    const tenant = await tenantService.createTenant();

    expect(tenant).toBeDefined();
    expect(tenant.id).toBeGreaterThan(0);
    expect(tenant.isActive).toBe(true);
    expect(tenant.createdAt).toBeDefined();
    expect(tenant.updatedAt).toBeDefined();

    // Verify in database using direct SQL
    const dbTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(tenant.id).first<Tenant>();

    expect(dbTenant).toBeDefined();
    expect(dbTenant?.id).toBe(tenant.id);
    expect(dbTenant?.isActive).toBe(1); // SQLite stores boolean as 0/1
    expect(dbTenant?.createdAt).toBeDefined();
    expect(dbTenant?.updatedAt).toBeDefined();
  });

  it("should create multiple tenants with unique IDs", async () => {
    const tenant1 = await tenantService.createTenant();
    const tenant2 = await tenantService.createTenant();
    const tenant3 = await tenantService.createTenant();

    expect(tenant1.id).not.toBe(tenant2.id);
    expect(tenant1.id).not.toBe(tenant3.id);
    expect(tenant2.id).not.toBe(tenant3.id);

    // All should be active
    expect(tenant1.isActive).toBe(true);
    expect(tenant2.isActive).toBe(true);
    expect(tenant3.isActive).toBe(true);

    // Verify all exist in database
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants"
    ).first<{ count: number }>();

    expect(countResult?.count).toBe(3);
  });

  it("should auto-increment tenant IDs", async () => {
    const tenant1 = await tenantService.createTenant();
    const tenant2 = await tenantService.createTenant();
    const tenant3 = await tenantService.createTenant();

    // IDs should be sequential (auto-increment)
    expect(tenant2.id).toBe(tenant1.id + 1);
    expect(tenant3.id).toBe(tenant2.id + 1);

    // Verify in database
    const allTenants = await env.DB.prepare(
      "SELECT * FROM Tenants ORDER BY id"
    ).all<Tenant>();

    expect(allTenants.results).toHaveLength(3);
    expect(allTenants.results[0].id).toBe(tenant1.id);
    expect(allTenants.results[1].id).toBe(tenant2.id);
    expect(allTenants.results[2].id).toBe(tenant3.id);
  });

  it("should set timestamps on creation", async () => {
    const beforeCreate = Math.floor(Date.now() / 1000);

    const tenant = await tenantService.createTenant();

    const afterCreate = Math.floor(Date.now() / 1000);

    // createdAt and updatedAt should be set
    expect(tenant.createdAt).toBeDefined();
    expect(tenant.updatedAt).toBeDefined();

    // Should be recent timestamps (within the test execution window)
    const createdAtSeconds = Math.floor(tenant.createdAt.getTime() / 1000);
    const updatedAtSeconds = Math.floor(tenant.updatedAt.getTime() / 1000);

    expect(createdAtSeconds).toBeGreaterThanOrEqual(beforeCreate);
    expect(createdAtSeconds).toBeLessThanOrEqual(afterCreate);
    expect(updatedAtSeconds).toBeGreaterThanOrEqual(beforeCreate);
    expect(updatedAtSeconds).toBeLessThanOrEqual(afterCreate);

    // Verify in database using direct SQL
    const dbTenant = await env.DB.prepare(
      "SELECT createdAt, updatedAt FROM Tenants WHERE id = ?"
    ).bind(tenant.id).first<{ createdAt: number; updatedAt: number }>();

    expect(dbTenant?.createdAt).toBeDefined();
    expect(dbTenant?.updatedAt).toBeDefined();
  });
});
