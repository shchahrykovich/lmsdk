import { describe, expect, it, vi } from "vitest";
import {
  NEW_DATASET_VALUE,
  initialDatasetSelection,
  isDatasetChoiceComplete,
  resolveDatasetChoice,
} from "../../../src/lib/dataset-choice";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("initialDatasetSelection", () => {
  it("selects the first dataset when the project has datasets", () => {
    expect(initialDatasetSelection([{ id: 7, name: "test" }, { id: 9, name: "other" }])).toBe("7");
  });

  it("selects a new dataset when the project has none", () => {
    expect(initialDatasetSelection([])).toBe(NEW_DATASET_VALUE);
  });
});

describe("isDatasetChoiceComplete", () => {
  it("accepts an existing dataset", () => {
    expect(isDatasetChoiceComplete({ selectedValue: "7", newName: "" })).toBe(true);
  });

  it("rejects a new dataset with a blank name", () => {
    expect(isDatasetChoiceComplete({ selectedValue: NEW_DATASET_VALUE, newName: "   " })).toBe(false);
  });

  it("accepts a new dataset with a name", () => {
    expect(isDatasetChoiceComplete({ selectedValue: NEW_DATASET_VALUE, newName: "scores" })).toBe(true);
  });

  it("rejects an empty selection", () => {
    expect(isDatasetChoiceComplete({ selectedValue: "", newName: "scores" })).toBe(false);
  });
});

describe("resolveDatasetChoice", () => {
  it("returns an existing dataset without calling the API", async () => {
    const fetcher = vi.fn();

    const result = await resolveDatasetChoice(3, { selectedValue: "7", newName: "" }, fetcher);

    expect(result).toEqual({ datasetId: "7", created: undefined });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates a new dataset with the trimmed name and returns its id", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(201, { dataset: { id: 42, name: "scores" } }));

    const result = await resolveDatasetChoice(3, { selectedValue: NEW_DATASET_VALUE, newName: "  scores " }, fetcher);

    expect(result).toEqual({ datasetId: "42", created: { id: 42, name: "scores" } });
    expect(fetcher).toHaveBeenCalledWith("/api/projects/3/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "scores" }),
    });
  });

  it("throws the server error when the dataset cannot be created", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(400, { error: "Name is required" }));

    await expect(
      resolveDatasetChoice(3, { selectedValue: NEW_DATASET_VALUE, newName: "x" }, fetcher)
    ).rejects.toThrow("Name is required");
  });
});
