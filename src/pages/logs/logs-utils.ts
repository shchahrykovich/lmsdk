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

export const buildDateRangeFilter = (
  value: unknown,
  label: string,
  onRemove: () => void,
): ActiveFilter | null => {
  if (!Array.isArray(value) || value.length === 0) return null;

  const [from, to] = value;
  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleDateString();
  };

  const fromStr = formatDate(from);
  const toStr = formatDate(to);

  let displayValue: string;
  if (fromStr && toStr) {
    displayValue = `${fromStr} - ${toStr}`;
  } else if (fromStr) {
    displayValue = `From ${fromStr}`;
  } else if (toStr) {
    displayValue = `Until ${toStr}`;
  } else {
    return null;
  }

  return {
    id: "dateRange",
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

  // dateFrom filter
  const dateFrom = params.get("dateFrom");
  if (dateFrom) {
    apiParams.set("dateFrom", dateFrom);
  }

  // dateTo filter
  const dateTo = params.get("dateTo");
  if (dateTo) {
    apiParams.set("dateTo", dateTo);
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

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
		second: "2-digit",
  });
};
