export const NEW_DATASET_VALUE = "new";

export interface DatasetOption {
  id: number;
  name: string;
}

export interface DatasetChoice {
  selectedValue: string;
  newName: string;
}

export interface ResolvedDatasetChoice {
  datasetId: string;
  created?: DatasetOption;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const initialDatasetSelection = (datasets: readonly DatasetOption[]): string =>
  datasets.length > 0 ? String(datasets[0].id) : NEW_DATASET_VALUE;

export const isNewDatasetChoice = (choice: DatasetChoice): boolean =>
  choice.selectedValue === NEW_DATASET_VALUE;

export const isDatasetChoiceComplete = (choice: DatasetChoice): boolean =>
  isNewDatasetChoice(choice) ? choice.newName.trim().length > 0 : choice.selectedValue !== "";

export async function resolveDatasetChoice(
  projectId: number,
  choice: DatasetChoice,
  fetcher: Fetcher = fetch
): Promise<ResolvedDatasetChoice> {
  if (!isNewDatasetChoice(choice)) {
    return { datasetId: choice.selectedValue, created: undefined };
  }

  const response = await fetcher(`/api/projects/${projectId}/datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: choice.newName.trim() }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error ?? "Failed to create dataset");
  }

  const data = (await response.json()) as { dataset: DatasetOption };
  const created = { id: data.dataset.id, name: data.dataset.name };
  return { datasetId: String(created.id), created };
}
