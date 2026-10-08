import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "../../../worker/shared/run-with-concurrency";

async function* itemsOf<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("runWithConcurrency", () => {
  it("runs every item and never more than the limit at the same time", async () => {
    let running = 0;
    let maxRunning = 0;
    const done: number[] = [];

    await runWithConcurrency(itemsOf([1, 2, 3, 4, 5, 6, 7]), 3, async (item) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await tick();
      running--;
      done.push(item);
    });

    expect(done.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(maxRunning).toBe(3);
  });

  it("starts no new items after a failure, waits for running items, then throws the first error", async () => {
    const started: number[] = [];
    const finished: number[] = [];

    const run = runWithConcurrency(itemsOf([1, 2, 3, 4, 5, 6]), 2, async (item) => {
      started.push(item);
      if (item === 1) {
        throw new Error("item 1 failed");
      }
      await tick();
      finished.push(item);
    });

    await expect(run).rejects.toThrow("item 1 failed");
    expect(started).toEqual([1, 2]);
    expect(finished).toEqual([2]);
  });

  it("throws when reading the next item fails, after running items finish", async () => {
    const finished: number[] = [];
    async function* failingSource(): AsyncGenerator<number> {
      yield 1;
      throw new Error("D1 unavailable");
    }

    const run = runWithConcurrency(failingSource(), 2, async (item) => {
      await tick();
      finished.push(item);
    });

    await expect(run).rejects.toThrow("D1 unavailable");
    expect(finished).toEqual([1]);
  });
});
