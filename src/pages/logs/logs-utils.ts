export type PromptOption = {
  promptId: number;
  promptName: string;
  version: number;
};

export type ActiveFilter = {
  id: string;
  label: string;
  value: string;
  onRemove: () => void;
};

const toArray = (value: unknown) => (Array.isArray(value) ? value : [value]);

export const buildStatusFilter = (
  value: unknown,
  label: string,
  onRemove: () => void,
): ActiveFilter | null => {
  const values = toArray(value);
  if (values.length !== 1) return null;
  return {
    id: "status",
    label,
    value: values[0] === "true" ? "Success" : "Error",
    onRemove,
  };
};

export const buildPromptFilter = (
  value: unknown,
  label: string,
  onRemove: () => void,
  promptOptions: PromptOption[],
): ActiveFilter | null => {
  const values = toArray(value);
  if (values.length === 0) return null;
  const [promptId, version] = String(values[0]).split("-");
  const prompt = promptOptions.find(
    (option) =>
      option.promptId === parseInt(promptId, 10) &&
      option.version === parseInt(version, 10),
  );
  if (!prompt) return null;
  return {
    id: "prompt",
    label,
    value: `${prompt.promptName} v${prompt.version}`,
    onRemove,
  };
};

export const buildVariablesFilter = (
  value: unknown,
  label: string,
  onRemove: () => void,
): ActiveFilter | null => {
  const variablesValue = value as { path?: string; value?: string; operator?: string };
  if (!variablesValue?.path) return null;

  let displayValue = variablesValue.path;
  if (variablesValue.operator === "notEmpty") {
    displayValue = `${variablesValue.path} not empty`;
  } else if (variablesValue.value) {
    displayValue = `${variablesValue.path} contains "${variablesValue.value}"`;
  }

  return {
    id: "variables",
    label,
    value: displayValue,
    onRemove,
  };
};

export const applyDirectFilters = (
  params: URLSearchParams,
  apiParams: URLSearchParams,
): void => {
  // isSuccess filter
  const isSuccess = params.get("isSuccess");
  if (isSuccess) {
    apiParams.set("isSuccess", isSuccess);
  }

  // promptId filter
  const promptId = params.get("promptId");
  if (promptId) {
    apiParams.set("promptId", promptId);
  }

  // version filter
  const version = params.get("version");
  if (version) {
    apiParams.set("version", version);
  }

  // variablePath filter
  const variablePath = params.get("variablePath");
  if (variablePath) {
    apiParams.set("variablePath", variablePath);
  }

  // variableValue filter
  const variableValue = params.get("variableValue");
  if (variableValue) {
    apiParams.set("variableValue", variableValue);
  }

  // variableOperator filter
  const variableOperator = params.get("variableOperator");
  if (variableOperator) {
    apiParams.set("variableOperator", variableOperator);
  }
};

export const applySortParams = (
  params: URLSearchParams,
  apiParams: URLSearchParams,
): void => {
  const sortField = params.get("sort-field");
  const sortDirection = params.get("sort-direction");

  if (sortField) {
    apiParams.set("sortField", sortField);
    apiParams.set("sortDirection", sortDirection ?? "desc");
  }
};


export const formatLogDate = (value: string | number): string => {
  const timestamp =
    typeof value === "number" && value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
};
