import type * as React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isValidMaxTokens,
  isValidTemperature,
  MAX_TEMPERATURE,
  type OpenRouterProviderSort,
  type OpenRouterReasoningEffort,
  type OpenRouterSettingsState,
} from "@/lib/openrouter-settings";

const INPUT_CLASS = "w-full h-8 px-3 text-sm rounded-md border border-input bg-background";

const parseNumberInput = (text: string, isValid: (value: unknown) => value is number): number | undefined => {
  const value = Number(text);
  return text.trim() !== "" && isValid(value) ? value : undefined;
};

const REASONING_EFFORT_OPTIONS: { value: OpenRouterReasoningEffort; label: string }[] = [
  { value: "default", label: "Model default" },
  { value: "none", label: "None (off)" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const PROVIDER_SORT_OPTIONS: { value: OpenRouterProviderSort; label: string }[] = [
  { value: "default", label: "OpenRouter default" },
  { value: "throughput", label: "Fastest output" },
  { value: "latency", label: "Fastest first token" },
  { value: "price", label: "Lowest price" },
];

type OpenRouterSettingsSectionProps = Readonly<{
  settings: OpenRouterSettingsState;
  setSettings: (value: OpenRouterSettingsState) => void;
}>;

export function OpenRouterSettingsSection({
  settings,
  setSettings,
}: OpenRouterSettingsSectionProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Reasoning Effort</Label>
        <Select
          value={settings.reasoningEffort}
          onValueChange={(value: OpenRouterReasoningEffort) =>
            setSettings({ ...settings, reasoningEffort: value })
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REASONING_EFFORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Provider Order</Label>
        <Select
          value={settings.providerSort}
          onValueChange={(value: OpenRouterProviderSort) =>
            setSettings({ ...settings, providerSort: value })
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Temperature</Label>
        <input
          type="number"
          min={0}
          max={MAX_TEMPERATURE}
          step={0.1}
          value={settings.temperature ?? ""}
          onChange={(event) =>
            setSettings({ ...settings, temperature: parseNumberInput(event.target.value, isValidTemperature) })
          }
          placeholder="Model default"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Max Tokens</Label>
        <input
          type="number"
          min={1}
          step={1}
          value={settings.maxTokens ?? ""}
          onChange={(event) =>
            setSettings({ ...settings, maxTokens: parseNumberInput(event.target.value, isValidMaxTokens) })
          }
          placeholder="No limit"
          className={INPUT_CLASS}
        />
        <span className="text-[10px] text-muted-foreground mt-0.5 block">Includes reasoning tokens</span>
      </div>
    </div>
  );
}
