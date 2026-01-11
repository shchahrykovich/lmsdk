import { ClientInputValidationError } from "./errors";

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

  /**
   * Parse pagination from query parameters
   * @param queryFn - Function to get query parameters (e.g., c.req.query)
   * @param config - Optional configuration for defaults and limits
   * @throws {ClientInputValidationError} If parameters are invalid
   */
  static parse(
    queryFn: (key: string) => string | undefined,
    config: PaginationConfig = {}
  ): Pagination {
    const defaultPage = config.defaultPage ?? 1;
    const defaultPageSize = config.defaultPageSize ?? 10;
    const maxPageSize = config.maxPageSize ?? 200;
    const minPageSize = config.minPageSize ?? 1;

    const page = parseInt(queryFn("page") ?? String(defaultPage));
    this.validatePage(page);

    const size = parseInt(queryFn("pageSize") ?? String(defaultPageSize));
    this.validatePageSize(size, minPageSize, maxPageSize);

    return new Pagination(page, size);
  }
}
