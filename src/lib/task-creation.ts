/**
 * Reusable task creation helpers (client-side, over the existing API routes).
 *
 * Kept separate from the dialog so future entry points — custom templates,
 * quick-add, keyboard shortcuts — can create a task plus its checklist without
 * duplicating the ordering rules.
 */

export interface CreateTaskInput {
  title: string;
  projectId: string;
  priority: string;
  description?: string;
}

interface CreatedTask {
  id: string;
}

export interface CreateTaskResult {
  task: CreatedTask;
  /** How many checklist steps were persisted. */
  stepsCreated: number;
  /** Steps that failed to save, if any. Task creation still succeeded. */
  failedSteps: string[];
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

export async function createTask(input: CreateTaskInput): Promise<CreatedTask> {
  return postJson<CreatedTask>("/api/tasks", input);
}

/**
 * Creates steps one at a time, in array order.
 *
 * This is intentionally sequential: `/api/task-steps` derives each new
 * position from the current maximum, so firing the requests in parallel would
 * race and scramble the checklist.
 */
export async function createTaskSteps(
  taskId: string,
  titles: readonly string[]
): Promise<{ created: number; failed: string[] }> {
  let created = 0;
  const failed: string[] = [];

  for (const title of titles) {
    try {
      await postJson("/api/task-steps", { taskId, title });
      created += 1;
    } catch {
      failed.push(title);
    }
  }

  return { created, failed };
}

/** Creates the task, then its checklist. Steps are optional. */
export async function createTaskWithSteps(
  input: CreateTaskInput,
  steps: readonly string[] = []
): Promise<CreateTaskResult> {
  const task = await createTask(input);

  if (steps.length === 0) {
    return { task, stepsCreated: 0, failedSteps: [] };
  }

  const { created, failed } = await createTaskSteps(task.id, steps);

  return { task, stepsCreated: created, failedSteps: failed };
}
