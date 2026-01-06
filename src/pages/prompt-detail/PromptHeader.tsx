/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Prompt, Project, PromptVersion, Provider } from "@/pages/prompt-detail.types";

type PromptHeaderProps = Readonly<{
  prompt: Prompt;
  project: Project;
  selectedVersion: number | null;
  routerVersion: number | null;
  versions: PromptVersion[];
  loadVersion: (version: number) => void;
  setAsDefault: (version: number) => void;
  provider: string;
  setProvider: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  proxy: "none" | "cloudflare";
  setProxy: (value: "none" | "cloudflare") => void;
  providers: Provider[];
  isSaving: boolean;
  handleSave: () => void;
}>;

export function PromptHeader({
  prompt,
  project,
  selectedVersion,
  routerVersion,
  versions,
  loadVersion,
  setAsDefault,
  provider,
  setProvider,
  model,
  setModel,
  proxy,
  setProxy,
  providers,
  isSaving,
  handleSave,
}: PromptHeaderProps): React.ReactNode {
  return (
    <div className="border-b border-border bg-card shrink-0">
      <div className="px-8 py-6">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-semibold text-foreground">
                {prompt.name}
              </h1>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors">
                      v{selectedVersion ?? prompt.latestVersion}
                      {selectedVersion === routerVersion && (
                        <span className="text-[10px] ml-0.5 opacity-70">
                          • active
                        </span>
                      )}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {versions.map((version) => (
                      <DropdownMenuItem
                        key={version.version}
                        onClick={() => loadVersion(version.version)}
                        className="flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {selectedVersion === version.version && (
                            <Check className="w-4 h-4" />
                          )}
                          <span
                            className={
                              selectedVersion !== version.version ? "ml-6" : ""
                            }
                          >
                            v{version.version}
                          </span>
                        </div>
                        {version.version === routerVersion && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            active
                          </span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedVersion !== routerVersion && selectedVersion !== null && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setAsDefault(selectedVersion)}
                  >
                    Set active
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {project.name} / {prompt.slug}
            </p>
          </div>

          <div className="flex gap-3 shrink-0 items-end">
            <div className="w-34">
              <Label htmlFor="provider" className="text-xs font-medium mb-1 block">
                Provider <span className="text-red-500">*</span>
              </Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-64">
              <Label htmlFor="model" className="text-xs font-medium mb-1 block">
                Model <span className="text-red-500">*</span>
              </Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {providers
                    .find((item) => item.id === provider)
                    ?.models.map((modelItem) => (
                      <SelectItem key={modelItem.id} value={modelItem.id}>
                        {modelItem.name}
                      </SelectItem>
                    )) ?? (
                    <SelectItem value="" disabled>
                      Select a provider first
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="w-34">
              <Label htmlFor="proxy" className="text-xs font-medium mb-1 block">
                Proxy
              </Label>
              <Select
                value={proxy}
                onValueChange={(value: "none" | "cloudflare") => setProxy(value)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="cloudflare">Cloudflare</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} disabled={isSaving} size="sm" className="h-9">
              {isSaving ? "Publishing..." : "Publish"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
