import type * as React from "react";
import type { JSX } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PaginationProps extends React.ComponentProps<"div"> {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly pageSize: number;
  readonly pageSizeOptions?: number[];
  readonly onPageChange?: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = [10, 20, 30, 40, 50, 100, 200],
  onPageChange,
  onPageSizeChange,
  className,
  ...props
}: PaginationProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const handlePageChange = (newPage: number): void => {
    if (onPageChange) {
      onPageChange(newPage);
      return;
    }
    // Update URL params
    const params = new URLSearchParams(location.search);
    params.set("page", String(newPage));
    void navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  const handlePageSizeChange = (newPageSize: number): void => {
    if (onPageSizeChange) {
      onPageSizeChange(newPageSize);
      return;
    }
    // Update URL params and reset to page 1
    const params = new URLSearchParams(location.search);
    params.set("perPage", String(newPageSize));
    params.set("page", "1");
    void navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  const canPreviousPage = currentPage > 1;
  const canNextPage = currentPage < totalPages;

  return (
    <div
      className={cn(
        "flex w-full flex-col-reverse items-center justify-between gap-4 overflow-auto p-1 sm:flex-row sm:gap-8",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
          <p className="whitespace-nowrap font-medium text-sm">Rows per page</p>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => handlePageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-18 data-size:h-8">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center font-medium text-sm">
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            aria-label="Go to first page"
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => handlePageChange(1)}
            disabled={!canPreviousPage}
          >
            <ChevronsLeft />
          </Button>
          <Button
            aria-label="Go to previous page"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!canPreviousPage}
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Go to next page"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!canNextPage}
          >
            <ChevronRight />
          </Button>
          <Button
            aria-label="Go to last page"
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => handlePageChange(totalPages)}
            disabled={!canNextPage}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
