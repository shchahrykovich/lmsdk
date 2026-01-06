/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { ApiKeysCard } from "@daveyplate/better-auth-ui";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export default function ApiKeys(): React.ReactNode {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-8 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">API Keys</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your API keys for authentication
            </p>
          </div>
          <Button asChild className="gap-2">
            <a href="/api/docs" target="_blank" rel="noreferrer">
              <FileText size={18} strokeWidth={2} />
              API docs
            </a>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl">
          <ApiKeysCard />
        </div>
      </div>
    </div>
  );
}
