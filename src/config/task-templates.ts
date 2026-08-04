/**
 * Built-in task templates.
 *
 * Deliberately config-only: no database model yet. When custom templates
 * arrive, they should produce this same shape so `createTaskFromTemplate`
 * keeps working unchanged.
 */

export interface TaskTemplate {
  /** Stable identifier used as the select value. */
  id: string;
  /** Shown in the picker. */
  name: string;
  /** Pre-fills the title field; the user can edit it before saving. */
  suggestedTitle: string;
  /** Checklist steps, created in this exact order. */
  steps: readonly string[];
}

export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  {
    id: "youtube-long-form",
    name: "YouTube Long-Form Video",
    suggestedTitle: "YouTube Long-Form Video",
    steps: [
      "Choose topic",
      "Write outline",
      "Record video",
      "Edit video",
      "Create thumbnail",
      "Upload and schedule",
      "Review performance",
    ],
  },
  {
    id: "short-form-reel",
    name: "Short-Form Reel",
    suggestedTitle: "Short-Form Reel",
    steps: [
      "Choose hook",
      "Record clips",
      "Edit video",
      "Add caption and on-screen text",
      "Schedule post",
      "Review performance",
    ],
  },
  {
    id: "weekly-ceo-review",
    name: "Weekly CEO Review",
    suggestedTitle: "Weekly CEO Review",
    steps: [
      "Review completed tasks",
      "Review focus sessions",
      "Check overdue work",
      "Review project progress",
      "Choose next weekly priority",
      "Create next week’s tasks",
    ],
  },
] as const;

export function getTaskTemplate(id: string): TaskTemplate | null {
  return TASK_TEMPLATES.find((template) => template.id === id) ?? null;
}
