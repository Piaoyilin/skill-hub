export type TimingContext = Record<
  string,
  string | number | boolean | undefined
>;

function timingEnabled() {
  return process.env.NODE_ENV === "development";
}

function elapsedMilliseconds(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(1));
}

export function logTiming(
  label: string,
  elapsedMs: number,
  context: TimingContext = {},
) {
  if (!timingEnabled()) return;

  console.info(
    "[Skill Hub timing]",
    JSON.stringify({
      label,
      ms: Number(elapsedMs.toFixed(1)),
      ...context,
    }),
  );
}

export function logTimingEvent(label: string, context: TimingContext = {}) {
  if (!timingEnabled()) return;

  console.info(
    "[Skill Hub timing]",
    JSON.stringify({
      label,
      ...context,
    }),
  );
}

export async function measureAsync<T>(
  label: string,
  operation: string,
  callback: () => Promise<T>,
  context: TimingContext = {},
): Promise<T> {
  if (!timingEnabled()) return callback();

  const startedAt = performance.now();

  try {
    const result = await callback();
    logTiming(label, elapsedMilliseconds(startedAt), {
      ...context,
      operation,
      status: "ok",
    });
    return result;
  } catch (error) {
    logTiming(label, elapsedMilliseconds(startedAt), {
      ...context,
      operation,
      status: "error",
    });
    throw error;
  }
}

