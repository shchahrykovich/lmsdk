import { useLocation } from "react-router-dom";
import { useMemo } from "react";

interface PaginationParams {
  page: string;
  pageSize: string;
}

interface UsePaginationParamsOptions {
  defaultPage?: string;
  defaultPageSize?: string;
}

interface UsePaginationParamsReturn {
  paginationParams: PaginationParams;
  buildApiParams: (additionalParams?: Record<string, string>) => URLSearchParams;
}

/**
 * Hook to extract pagination parameters from URL and build API query params
 * @param options - Configuration options for default values
 * @returns Pagination parameters and a function to build API params
 */
export function usePaginationParams(
  options: UsePaginationParamsOptions = {}
): UsePaginationParamsReturn {
  const { defaultPage = "1", defaultPageSize = "10" } = options;
  const location = useLocation();

  const paginationParams = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      page: params.get("page") ?? defaultPage,
      pageSize: params.get("perPage") ?? defaultPageSize,
    };
  }, [location.search, defaultPage, defaultPageSize]);

  const buildApiParams = useMemo(
    () => (additionalParams?: Record<string, string>) => {
      const apiParams = new URLSearchParams({
        page: paginationParams.page,
        pageSize: paginationParams.pageSize,
      });

      if (additionalParams) {
        Object.entries(additionalParams).forEach(([key, value]) => {
          apiParams.set(key, value);
        });
      }

      return apiParams;
    },
    [paginationParams.page, paginationParams.pageSize]
  );

  return {
    paginationParams,
    buildApiParams,
  };
}
