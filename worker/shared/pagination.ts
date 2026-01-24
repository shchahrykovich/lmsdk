import { ClientInputValidationError } from "./errors";
import type {Context} from "hono";
import type {HonoEnv} from "../routes/app";

export interface PaginationConfig {
  defaultPage?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
  minPageSize?: number;
}

/**
 * Parses and validates pagination parameters from query strings
 */
export class Pagination {
  readonly page: number;
  readonly size: number;

  private constructor(page: number, size: number) {
    this.page = page;
    this.size = size;
  }

  private static validatePage(page: number): void {
    if (isNaN(page) || page < 1) {
      throw new ClientInputValidationError("Invalid page number");
    }
  }

  private static validatePageSize(size: number, minPageSize: number, maxPageSize: number): void {
    if (isNaN(size) || size < minPageSize || size > maxPageSize) {
      throw new ClientInputValidationError(`Invalid page size (must be between ${minPageSize} and ${maxPageSize})`);
    }
  }

  static parse(
		c: Context<HonoEnv>,
    config: PaginationConfig = {}
  ): Pagination {
    const defaultPage = config.defaultPage ?? 1;
    const defaultPageSize = config.defaultPageSize ?? 10;
    const maxPageSize = config.maxPageSize ?? 200;
    const minPageSize = config.minPageSize ?? 1;

    const page = parseInt(c.req.query("page") ?? String(defaultPage));
    this.validatePage(page);

    const size = parseInt(c.req.query("pageSize") ?? String(defaultPageSize));
    this.validatePageSize(size, minPageSize, maxPageSize);

    return new Pagination(page, size);
  }
}
