"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, X } from "lucide-react";

interface VariablesFilterDialogProps {
  variablePaths: string[];
  onApplyFilter: (filter: { path: string; value: string; operator: string }) => void;
  onClearFilter?: () => void;
  currentFilter?: { path?: string; value?: string; operator?: string };
}

export function VariablesFilterDialog({
  variablePaths,
  onApplyFilter,
  onClearFilter,
  currentFilter,
}: VariablesFilterDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedPath, setSelectedPath] = React.useState(currentFilter?.path || "");
  const [operator, setOperator] = React.useState<"contains" | "notEmpty">(
    currentFilter?.operator as "contains" | "notEmpty" || "notEmpty"
  );
  const [value, setValue] = React.useState(currentFilter?.value || "");

  // Format the display text for active filter
  const filterDisplayText = React.useMemo(() => {
    if (!currentFilter?.path) return null;

    if (currentFilter.operator === "notEmpty") {
      return `${currentFilter.path} not empty`;
    } else if (currentFilter.value) {
      return `${currentFilter.path} contains "${currentFilter.value}"`;
    }
    return currentFilter.path;
  }, [currentFilter]);

  const hasActiveFilter = !!currentFilter?.path;

  // Sync internal state when currentFilter changes
  React.useEffect(() => {
    if (currentFilter?.path) {
      setSelectedPath(currentFilter.path);
      setOperator(currentFilter.operator as "contains" | "notEmpty" || "contains");
      setValue(currentFilter.value || "");
    }
  }, [currentFilter]);

  const handleApply = () => {
    if (!selectedPath) return;

    onApplyFilter({
      path: selectedPath,
      value: operator === "notEmpty" ? "" : value,
      operator,
    });
    setOpen(false);
  };

  const handleCancel = () => {
    setSelectedPath(currentFilter?.path || "");
    setOperator(currentFilter?.operator as "contains" | "notEmpty" || "contains");
    setValue(currentFilter?.value || "");
    setOpen(false);
  };

  const handleClearClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClearFilter) {
      onClearFilter();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {hasActiveFilter ? (
            <>
              <X
                className="mr-2 h-4 w-4 cursor-pointer hover:opacity-70"
                onClick={handleClearClick}
              />
              <span className="font-mono text-xs">{filterDisplayText}</span>
            </>
          ) : (
            <>
              <PlusCircle className="mr-2 h-4 w-4" />
              Variables
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Filter by Variables</DialogTitle>
          <DialogDescription>
            Select a variable path and configure the filter criteria.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="variable-path">Variable Path</Label>
            <Select value={selectedPath} onValueChange={setSelectedPath}>
              <SelectTrigger id="variable-path">
                <SelectValue placeholder="Select a variable path" />
              </SelectTrigger>
              <SelectContent>
                {variablePaths.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No variable paths available
                  </div>
                ) : (
                  variablePaths.map((path) => (
                    <SelectItem key={path} value={path}>
                      <span className="font-mono text-xs">{path}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="operator">Operation</Label>
            <Select
              value={operator}
              onValueChange={(val) => setOperator(val as "contains" | "notEmpty")}
            >
              <SelectTrigger id="operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">contains</SelectItem>
                <SelectItem value="notEmpty">not empty</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {operator === "contains" && (
            <div className="grid gap-2">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                placeholder="Enter search value..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!selectedPath}>
            Add Filter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
