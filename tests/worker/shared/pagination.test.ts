import { describe, it, expect } from "vitest";
import { Pagination } from "../../../worker/shared/pagination";
import { ClientInputValidationError } from "../../../worker/shared/errors";

describe("Pagination", () => {
  // Helper to create a mock query function
  const createQueryFn = (params: Record<string, string>) => {
    return (key: string) => params[key];
  };

  describe("parse with default configuration", () => {
    it("parses valid pagination parameters", () => {
      const queryFn = createQueryFn({ page: "2", pageSize: "20" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(2);
      expect(pagination.size).toBe(20);
    });

    it("uses default page when not provided", () => {
      const queryFn = createQueryFn({ pageSize: "20" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(1);
      expect(pagination.size).toBe(20);
    });

    it("uses default pageSize when not provided", () => {
      const queryFn = createQueryFn({ page: "3" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(3);
      expect(pagination.size).toBe(10);
    });

    it("uses all defaults when no parameters provided", () => {
      const queryFn = createQueryFn({});
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(1);
      expect(pagination.size).toBe(10);
    });

    it("parses maximum allowed page size", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "200" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(1);
      expect(pagination.size).toBe(200);
    });
  });

  describe("parse with custom configuration", () => {
    it("uses custom default page", () => {
      const queryFn = createQueryFn({ pageSize: "25" });
      const pagination = Pagination.parse(queryFn, { defaultPage: 5 });

      expect(pagination.page).toBe(5);
      expect(pagination.size).toBe(25);
    });

    it("uses custom default page size", () => {
      const queryFn = createQueryFn({ page: "2" });
      const pagination = Pagination.parse(queryFn, { defaultPageSize: 50 });

      expect(pagination.page).toBe(2);
      expect(pagination.size).toBe(50);
    });

    it("respects custom max page size", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "100" });
      const pagination = Pagination.parse(queryFn, { maxPageSize: 100 });

      expect(pagination.page).toBe(1);
      expect(pagination.size).toBe(100);
    });

    it("respects custom min page size", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "5" });
      const pagination = Pagination.parse(queryFn, { minPageSize: 5 });

      expect(pagination.page).toBe(1);
      expect(pagination.size).toBe(5);
    });
  });

  describe("validation errors", () => {
    it("throws error for invalid page number (NaN)", () => {
      const queryFn = createQueryFn({ page: "invalid", pageSize: "10" });

      expect(() => Pagination.parse(queryFn)).toThrow(ClientInputValidationError);
      expect(() => Pagination.parse(queryFn)).toThrow("Invalid page number");
    });

    it("throws error for page less than 1", () => {
      const queryFn = createQueryFn({ page: "0", pageSize: "10" });

      expect(() => Pagination.parse(queryFn)).toThrow(ClientInputValidationError);
      expect(() => Pagination.parse(queryFn)).toThrow("Invalid page number");
    });

    it("throws error for negative page", () => {
      const queryFn = createQueryFn({ page: "-1", pageSize: "10" });

      expect(() => Pagination.parse(queryFn)).toThrow(ClientInputValidationError);
      expect(() => Pagination.parse(queryFn)).toThrow("Invalid page number");
    });

    it("throws error for invalid page size (NaN)", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "invalid" });

      expect(() => Pagination.parse(queryFn)).toThrow(ClientInputValidationError);
      expect(() => Pagination.parse(queryFn)).toThrow("Invalid page size");
    });

    it("throws error for page size less than min", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "0" });

      expect(() => Pagination.parse(queryFn)).toThrow(ClientInputValidationError);
      expect(() => Pagination.parse(queryFn)).toThrow("Invalid page size (must be between 1 and 200)");
    });

    it("throws error for page size greater than max", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "201" });

      expect(() => Pagination.parse(queryFn)).toThrow(ClientInputValidationError);
      expect(() => Pagination.parse(queryFn)).toThrow("Invalid page size (must be between 1 and 200)");
    });

    it("throws error for negative page size", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "-10" });

      expect(() => Pagination.parse(queryFn)).toThrow(ClientInputValidationError);
      expect(() => Pagination.parse(queryFn)).toThrow("Invalid page size");
    });

    it("throws error with custom min/max in message", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "150" });

      expect(() => Pagination.parse(queryFn, { maxPageSize: 100, minPageSize: 5 })).toThrow(
        "Invalid page size (must be between 5 and 100)"
      );
    });
  });

  describe("edge cases", () => {
    it("handles floating point page numbers by truncating", () => {
      const queryFn = createQueryFn({ page: "2.5", pageSize: "10" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(2);
      expect(pagination.size).toBe(10);
    });

    it("handles floating point page size by truncating", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "15.7" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(1);
      expect(pagination.size).toBe(15);
    });

    it("handles whitespace in parameters", () => {
      const queryFn = createQueryFn({ page: " 3 ", pageSize: " 25 " });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(3);
      expect(pagination.size).toBe(25);
    });
  });

  describe("real-world scenarios", () => {
    it("works with Hono-style query function", () => {
      // Simulate Hono's c.req.query behavior
      const honoQuery = (key: string) => {
        const params = new URLSearchParams("?page=5&pageSize=50");
        return params.get(key) ?? undefined;
      };

      const pagination = Pagination.parse(honoQuery);

      expect(pagination.page).toBe(5);
      expect(pagination.size).toBe(50);
    });

    it("handles large page numbers", () => {
      const queryFn = createQueryFn({ page: "1000000", pageSize: "100" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.page).toBe(1000000);
      expect(pagination.size).toBe(100);
    });

    it("validates page size boundary at exactly max", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "200" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.size).toBe(200);
    });

    it("validates page size boundary at exactly min", () => {
      const queryFn = createQueryFn({ page: "1", pageSize: "1" });
      const pagination = Pagination.parse(queryFn);

      expect(pagination.size).toBe(1);
    });
  });
});
