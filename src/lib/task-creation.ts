/**
 * Reusable task creation helper (client-side, over the existing API route).
 *
 * A task and its checklist are created in ONE request. `/api/tasks` performs a
 * nested Prisma create, which is atomic — there is no window where a task
 * exists with half its template steps.
 */

export interface CreateTaskInput {
  title: string;
  projectId: string;
  priority: string;
  description?: string;
}

interface CreatedStep {
  id: string;
  title: string;
  position: number;
}

interface CreatedTask {
  id: string;
  steps?: CreatedStep[];
}

export interface CreateTaskResult {
  task: CreatedTask;
  stepsCreated: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}

/**
 * Creates a task, optionally with its checklist. Step order in the array is the
 * order they are persisted in.
 */
export async function createTaskWithSteps(
  input: CreateTaskInput,
  steps: readonly string[] = []
): Promise<CreateTaskResult> {
  const task = await postJson<CreatedTask>("/api/tasks", {
    ...input,
    ...(steps.length > 0 ? { steps: [...steps] } : {}),
  });

  return { task, stepsCreated: task.steps?.length ?? 0 };
}
