/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState } from "react";
import JsonView from "@uiw/react-json-view";
import { Maximize2, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type JsonSectionProps = Readonly<{
  title: string;
  data: unknown;
  collapsed?: boolean | number;
  compact?: boolean;
  contextTitle?: string;
  logId?: number;
}>;

export default function JsonSection({
  title,
  data,
  collapsed = 2,
  compact = false,
  contextTitle,
  logId,
}: JsonSectionProps): React.ReactNode {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const getFullscreenTitle = () => {
    if (contextTitle && logId !== undefined) {
      return `${contextTitle} (log #${logId}) - ${title}`;
    }
    if (contextTitle) {
      return `${contextTitle} - ${title}`;
    }
    return title;
  };

  const parseJsonData = (data: unknown) => {
    if (data === null || data === undefined) {
      return null;
    }
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  };

  const parsedData = parseJsonData(data);

  if (compact) {
    return (
      <>
        <div className="rounded-lg border border-border bg-card p-4 group">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <button
              onClick={() => setIsFullscreen(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
              aria-label="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {parsedData ? (
              <JsonView
                value={parsedData}
                collapsed={collapsed}
                style={{ fontSize: "0.75rem" }}
              />
            ) : (
              <div className="text-xs text-muted-foreground">No data available.</div>
            )}
          </div>
        </div>

        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <DialogTitle>
                  {getFullscreenTitle()}
                </DialogTitle>
                {parsedData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="gap-2"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronsUpDown className="h-4 w-4" />
                        Collapse All
                      </>
                    ) : (
                      <>
                        <ChevronsDownUp className="h-4 w-4" />
                        Expand All
                      </>
                    )}
                  </Button>
                )}
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto mt-4">
              {parsedData ? (
                <JsonView value={parsedData} collapsed={isExpanded ? false : 4} />
              ) : (
                <div className="text-sm text-muted-foreground">No data available.</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-6 group">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={() => setIsFullscreen(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
            aria-label="Fullscreen"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-3">
          {parsedData ? (
            <JsonView value={parsedData} collapsed={collapsed} />
          ) : (
            <div className="text-xs text-muted-foreground">No data available.</div>
          )}
        </div>
      </div>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle>
                {getFullscreenTitle()}
              </DialogTitle>
              {parsedData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="gap-2"
                >
                  {isExpanded ? (
                    <>
                      <ChevronsUpDown className="h-4 w-4" />
                      Collapse All
                    </>
                  ) : (
                    <>
                      <ChevronsDownUp className="h-4 w-4" />
                      Expand All
                      </>
                  )}
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-4">
            {parsedData ? (
              <JsonView value={parsedData} collapsed={isExpanded ? false : 4} />
            ) : (
              <div className="text-sm text-muted-foreground">No data available.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
