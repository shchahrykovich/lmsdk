"use client";

import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table,
  type TableOptions,
  type TableState,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  type SingleParser,
  type UseQueryStateOptions,
  useQueryState,
  useQueryStates,
} from "nuqs";
import * as React from "react";

import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import type { ExtendedColumnSort, QueryKeys } from "@/types/data-table";

const PAGE_KEY = "page";
const PER_PAGE_KEY = "perPage";
const SORT_FIELD_KEY = "sort-field";
const SORT_DIRECTION_KEY = "sort-direction";
const JOIN_OPERATOR_KEY = "joinOperator";
const ARRAY_SEPARATOR = ",";
const DEBOUNCE_MS = 300;
const THROTTLE_MS = 50;

const resolveQueryKeys = (queryKeys?: Partial<QueryKeys>) => ({
  pageKey: queryKeys?.page ?? PAGE_KEY,
  perPageKey: queryKeys?.perPage ?? PER_PAGE_KEY,
  sortFieldKey: SORT_FIELD_KEY,
  sortDirectionKey: SORT_DIRECTION_KEY,
  joinOperatorKey: queryKeys?.joinOperator ?? JOIN_OPERATOR_KEY,
});

const resolveInitialPageSize = <TData,>(
  initialState?: UseDataTableProps<TData>["initialState"],
) => initialState?.pagination?.pageSize ?? 10;

const resolveInitialSorting = <TData,>(
  initialState?: UseDataTableProps<TData>["initialState"],
) => initialState?.sorting ?? [];

const isVariablesDialogFilter = (
  column: { meta?: { variant?: string; filterComponent?: string } } | undefined,
) => column?.meta?.variant === "custom" && column?.meta?.filterComponent === "variablesDialog";

interface UseDataTableProps<TData>
  extends Omit<
      TableOptions<TData>,
      | "state"
      | "pageCount"
      | "getCoreRowModel"
      | "manualFiltering"
      | "manualPagination"
      | "manualSorting"
    >,
    Required<Pick<TableOptions<TData>, "pageCount">> {
  initialState?: Omit<Partial<TableState>, "sorting"> & {
    sorting?: ExtendedColumnSort<TData>[];
  };
  queryKeys?: Partial<QueryKeys>;
  history?: "push" | "replace";
  debounceMs?: number;
  throttleMs?: number;
  clearOnDefault?: boolean;
  enableAdvancedFilter?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  startTransition?: React.TransitionStartFunction;
}

export function useDataTable<TData>(
  props: UseDataTableProps<TData>,
): {
  table: Table<TData>;
  shallow: boolean;
  debounceMs: number;
  throttleMs: number;
} {
  const {
    columns,
    pageCount = -1,
    initialState,
    queryKeys,
    history = "replace",
    debounceMs = DEBOUNCE_MS,
    throttleMs = THROTTLE_MS,
    clearOnDefault = false,
    enableAdvancedFilter = false,
    scroll = false,
    shallow = true,
    startTransition,
    ...tableProps
  } = props;
  const { pageKey, perPageKey, sortFieldKey, sortDirectionKey, joinOperatorKey } =
    resolveQueryKeys(queryKeys);

  const queryStateOptions = React.useMemo<
    Omit<UseQueryStateOptions<string>, "parse">
  >(
    () => ({
      history,
      scroll,
      shallow,
      throttleMs,
      debounceMs,
      clearOnDefault,
      startTransition,
    }),
    [
      history,
      scroll,
      shallow,
      throttleMs,
      debounceMs,
      clearOnDefault,
      startTransition,
    ],
  );

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(
    initialState?.rowSelection ?? {},
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialState?.columnVisibility ?? {});

  const [page, setPage] = useQueryState(
    pageKey,
    parseAsInteger.withOptions(queryStateOptions).withDefault(1),
  );
  const [perPage, setPerPage] = useQueryState(
    perPageKey,
    parseAsInteger
      .withOptions(queryStateOptions)
      .withDefault(resolveInitialPageSize(initialState)),
  );

  const pagination: PaginationState = React.useMemo(() => {
    return {
      pageIndex: page - 1, // zero-based index -> one-based index
      pageSize: perPage,
    };
  }, [page, perPage]);

  const onPaginationChange = React.useCallback(
    (updaterOrValue: Updater<PaginationState>) => {
      if (typeof updaterOrValue === "function") {
        const newPagination = updaterOrValue(pagination);
        void setPage(newPagination.pageIndex + 1);
        void setPerPage(newPagination.pageSize);
      } else {
        void setPage(updaterOrValue.pageIndex + 1);
        void setPerPage(updaterOrValue.pageSize);
      }
    },
    [pagination, setPage, setPerPage],
  );

  const [sortField, setSortField] = useQueryState(
    sortFieldKey,
    parseAsString.withOptions(queryStateOptions),
  );

  const [sortDirection, setSortDirection] = useQueryState(
    sortDirectionKey,
    parseAsString.withOptions(queryStateOptions),
  );

  const sorting: SortingState = React.useMemo(() => {
    if (!sortField) {
      return resolveInitialSorting(initialState);
    }
    return [
      {
        id: sortField,
        desc: sortDirection === "desc",
      },
    ];
  }, [sortField, sortDirection, initialState]);

  const onSortingChange = React.useCallback(
    (updaterOrValue: Updater<SortingState>) => {
      const newSorting =
        typeof updaterOrValue === "function"
          ? updaterOrValue(sorting)
          : updaterOrValue;

      if (newSorting.length === 0) {
        void setSortField(null);
        void setSortDirection(null);
      } else {
        const firstSort = newSorting[0];
        void setSortField(firstSort.id);
        void setSortDirection(firstSort.desc ? "desc" : "asc");
      }
    },
    [sorting, setSortField, setSortDirection],
  );

  const filterableColumns = React.useMemo(() => {
    if (enableAdvancedFilter) return [];

    return columns.filter((column) => column.enableColumnFilter);
  }, [columns, enableAdvancedFilter]);

  // Map column IDs to URL parameter names
  const getFilterParamName = (columnId: string): string => {
    const mapping: Record<string, string> = {
      promptName: "promptId", // Maps to promptId-version format, will need special handling
      isSuccess: "isSuccess",
      variables: "variablePath", // Variables use multiple params (variablePath, variableValue, variableOperator)
    };
    return mapping[columnId] ?? columnId;
  };

  const filterParsers = React.useMemo(() => {
    if (enableAdvancedFilter) return {};

    return filterableColumns.reduce<
      Record<string, SingleParser<string> | SingleParser<string[]>>
    >((acc, column) => {
      const columnId = column.id ?? "";

      // Handle custom filter types (like variables dialog with object values)
      if (isVariablesDialogFilter(column)) {
        // Variables use multiple URL params, handled separately
        acc.variablePath = parseAsString.withOptions(queryStateOptions);
        acc.variableValue = parseAsString.withOptions(queryStateOptions);
        acc.variableOperator = parseAsString.withOptions(queryStateOptions);
        return acc;
      }

      // For promptName, we need both promptId and version params
      if (columnId === "promptName") {
        acc.promptId = parseAsString.withOptions(queryStateOptions);
        acc.version = parseAsString.withOptions(queryStateOptions);
        return acc;
      }

      const paramName = getFilterParamName(columnId);
      // isSuccess should be a single value, not an array, even though it has options
      if (columnId === "isSuccess") {
        acc[paramName] = parseAsString.withOptions(queryStateOptions);
      } else if (column.meta?.options) {
        acc[paramName] = parseAsArrayOf(
          parseAsString,
          ARRAY_SEPARATOR,
        ).withOptions(queryStateOptions);
      } else {
        acc[paramName] = parseAsString.withOptions(queryStateOptions);
      }
      return acc;
    }, {});
  }, [filterableColumns, queryStateOptions, enableAdvancedFilter]);

  const [filterValues, setFilterValues] = useQueryStates(filterParsers);

  const debouncedSetFilterValues = useDebouncedCallback(
    (values: typeof filterValues) => {
      void setPage(1);
      void setFilterValues(values);
    },
    debounceMs,
  );

  const toSingleValue = (value: string | string[] | null | undefined): string | undefined => {
    if (!value) return undefined;
    return typeof value === "string" ? value : value[0];
  };

  const initialColumnFilters: ColumnFiltersState = React.useMemo(() => {
    if (enableAdvancedFilter) return [];

    const filters: ColumnFiltersState = [];

    if (filterValues.isSuccess) {
      // isSuccess is always a string (not array) in URL, but table expects array
      filters.push({ id: "isSuccess", value: [filterValues.isSuccess] });
    }

    if (filterValues.promptId && filterValues.version) {
      const promptId = toSingleValue(filterValues.promptId);
      const version = toSingleValue(filterValues.version);
      if (promptId && version) {
        filters.push({ id: "promptName", value: [`${promptId}-${version}`] });
      }
    }

    if (filterValues.variablePath) {
      filters.push({
        id: "variables",
        value: {
          path: toSingleValue(filterValues.variablePath),
          value: toSingleValue(filterValues.variableValue),
          operator: toSingleValue(filterValues.variableOperator),
        },
      });
    }

    return filters;
  }, [filterValues, enableAdvancedFilter]);

  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>(initialColumnFilters);

  const handleIsSuccessFilter = (value: unknown, updates: Record<string, string | null>) => {
    // Table stores filter value as array, but URL should have single string value
    const values = Array.isArray(value) ? value : [value];
    if (values.length > 0 && values[0] !== null && values[0] !== undefined) {
      updates.isSuccess = String(values[0]);
    }
  };

  const handlePromptNameFilter = (value: unknown, updates: Record<string, string | null>) => {
    const values = Array.isArray(value) ? value : [value];
    if (values.length === 1 && typeof values[0] === "string") {
      const [promptId, version] = values[0].split("-");
      updates.promptId = promptId;
      updates.version = version;
    }
  };

  const handleVariablesFilter = (value: unknown, updates: Record<string, string | null>) => {
    const varsFilter = value as { path?: string; value?: string; operator?: string };
    updates.variablePath = varsFilter.path ?? null;
    updates.variableValue = varsFilter.value ?? null;
    updates.variableOperator = varsFilter.operator ?? null;
  };

  const buildFilterUpdates = React.useCallback((filters: ColumnFiltersState) => {
    const updates: Record<string, string | null> = {
      isSuccess: null,
      promptId: null,
      version: null,
      variablePath: null,
      variableValue: null,
      variableOperator: null,
    };

    for (const filter of filters) {
      if (filter.id === "isSuccess") {
        handleIsSuccessFilter(filter.value, updates);
      } else if (filter.id === "promptName") {
        handlePromptNameFilter(filter.value, updates);
      } else if (filter.id === "variables") {
        handleVariablesFilter(filter.value, updates);
      }
    }

    return updates;
  }, []);

  const onColumnFiltersChange = React.useCallback(
    (updaterOrValue: Updater<ColumnFiltersState>) => {
      if (enableAdvancedFilter) return;

      setColumnFilters((prev) => {
        const next =
          typeof updaterOrValue === "function"
            ? updaterOrValue(prev)
            : updaterOrValue;

        const updates = buildFilterUpdates(next);
        debouncedSetFilterValues(updates);
        return next;
      });
    },
    [debouncedSetFilterValues, enableAdvancedFilter, buildFilterUpdates],
  );

  const table = useReactTable({
    ...tableProps,
    columns,
    initialState,
    pageCount,
    state: {
      pagination,
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    defaultColumn: {
      ...tableProps.defaultColumn,
      enableColumnFilter: false,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onPaginationChange,
    onSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    meta: {
      ...tableProps.meta,
      queryKeys: {
        page: pageKey,
        perPage: perPageKey,
        sortField: sortFieldKey,
        sortDirection: sortDirectionKey,
        joinOperator: joinOperatorKey,
      },
    },
  });

  return { table, shallow, debounceMs, throttleMs };
}
