"use client";

import type { Column } from "@tanstack/react-table";
import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DataTableVariablesFilterProps<TData> {
  column: Column<TData>;
  title: string;
  variablePaths: string[];
}

const OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "notEmpty", label: "not empty" },
] as const;

type Operator = typeof OPERATORS[number]["value"];

export function DataTableVariablesFilter<TData>({
  column,
  title,
  variablePaths,
}: DataTableVariablesFilterProps<TData>) {
  const [open, setOpen] = React.useState(false);
  const filterValue = (column.getFilterValue() as { path?: string; value?: string; operator?: Operator }) || {};
  const selectedPath = filterValue.path || "";
  const searchValue = filterValue.value || "";
  const operator = filterValue.operator || "contains";

  const handlePathSelect = (path: string) => {
    const currentPath = selectedPath === path ? "" : path;
    column.setFilterValue({
      path: currentPath,
      value: currentPath ? searchValue : "",
      operator: currentPath ? "contains" : undefined,
    });
    setOpen(false);
  };

  const handleOperatorChange = (newOperator: string) => {
    column.setFilterValue({
      path: selectedPath,
      value: searchValue,
      operator: newOperator as Operator,
    });
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    column.setFilterValue({
      path: selectedPath,
      value: event.target.value,
      operator,
    });
  };

  const handleClear = () => {
    column.setFilterValue(undefined);
  };

  const hasFilter = selectedPath || searchValue;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-dashed"
            disabled={variablePaths.length === 0}
          >
            {selectedPath || title}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${title.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>No paths found.</CommandEmpty>
              <CommandGroup>
                {variablePaths.map((path) => (
                  <CommandItem
                    key={path}
                    value={path}
                    onSelect={() => handlePathSelect(path)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedPath === path ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="font-mono text-xs">{path}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedPath && (
        <>
          <Select value={operator} onValueChange={handleOperatorChange}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search value..."
            value={searchValue}
            onChange={handleSearchChange}
            className="h-8 w-40"
          />
        </>
      )}

      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={handleClear}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
