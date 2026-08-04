/**
 * Mission checklist derivation shared by the dashboard Mission card and Focus Mode.
 * Keeping this pure means both surfaces always agree on progress, current step
 * and Harper's recommendation without duplicating the rules.
 */

export interface MissionStep {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

export interface MissionProgress {
  completedCount: number;
  totalSteps: number;
  /** 0-100, rounded. */
  percent: number;
  /** First incomplete step, or null when there are none left. */
  currentStep: MissionStep | null;
  /** The step immediately after the current one, regardless of its state. */
  nextStep: MissionStep | null;
  hasSteps: boolean;
  /** True only when there is at least one step and all of them are done. */
  isComplete: boolean;
}

export function deriveMissionProgress(steps: MissionStep[]): MissionProgress {
  const totalSteps = steps.length;
  const completedCount = steps.filter((step) => step.completed).length;
  const currentIndex = steps.findIndex((step) => !step.completed);

  return {
    completedCount,
    totalSteps,
    percent: totalSteps === 0 ? 0 : Math.round((completedCount / totalSteps) * 100),
    currentStep: currentIndex === -1 ? null : steps[currentIndex],
    nextStep: currentIndex === -1 ? null : (steps[currentIndex + 1] ?? null),
    hasSteps: totalSteps > 0,
    isComplete: totalSteps > 0 && completedCount === totalSteps,
  };
}

export function harperRecommendation(
  progress: MissionProgress,
  hasMission: boolean
): string {
  if (!hasMission) {
    return "Create a task or choose your next priority.";
  }

  if (!progress.hasSteps) {
    return "Break this mission into steps so you know exactly where to start.";
  }

  const { currentStep, nextStep } = progress;

  if (currentStep && nextStep) {
    return `Complete ${currentStep.title} before moving to ${nextStep.title}.`;
  }

  if (currentStep) {
    return `Finish ${currentStep.title} to close out this mission.`;
  }

  return "Every step is done. Mark the mission complete and pick your next priority.";
}
