export async function runWithConcurrency<T>(
  source: AsyncIterable<T>,
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  const iterator = source[Symbol.asyncIterator]();
  let failure: { error: unknown } | undefined;

  const worker = async (): Promise<void> => {
    while (!failure) {
      try {
        const next = await iterator.next();
        if (next.done) return;
        await task(next.value);
      } catch (error) {
        failure ??= { error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
  if (failure) {
    throw failure.error;
  }
}
