/**
 * Deterministic closing recommendation for the Harper Morning Brief.
 *
 * Dependency-free on purpose, same arrangement as `classify.ts` and
 * `schedule-conflicts.ts`. This is the fallback path — used whenever no AI
 * provider is configured or the AI call/validation fails — and it must
 * always produce a short, grounded, Chief-of-Staff-toned recommendation from
 * data that is already known to be true, exactly the way
 * `harper/fallback.ts` never invents anything beyond its context.
 */

export interface RecommendationInput {
  actionTodayCount: number;
  moneyCount: number;
  hasScheduleConflict: boolean;
  missionTitle: string | null;
  missionIsOverdue: boolean;
  overdueTaskCount: number;
  nextEventTitle: string | null;
}

/** Always exactly two or three sentences — never a longer essay. */
export function buildDeterministicRecommendation(
  input: RecommendationInput
): string {
  const sentences: string[] = [];

  if (input.actionTodayCount > 0) {
    const noun = input.actionTodayCount === 1 ? "item needs" : "items need";
    sentences.push(
      `You have ${input.actionTodayCount} ${noun} attention before the day gets away from you${
        input.moneyCount > 0 ? " — start with the account and payment items" : ""
      }.`
    );
  } else {
    sentences.push("Nothing in your inbox needs action today.");
  }

  if (input.hasScheduleConflict) {
    sentences.push(
      "Your calendar has an overlap today — review the suggested adjustment before it sneaks up on you."
    );
  } else if (input.nextEventTitle) {
    sentences.push(`Protect your time for “${input.nextEventTitle}”.`);
  }

  if (input.missionTitle) {
    sentences.push(
      input.missionIsOverdue
        ? `“${input.missionTitle}” is overdue in KurvzOS — that is what the rest of today should protect.`
        : `Once that is handled, “${input.missionTitle}” is what KurvzOS says today should protect.`
    );
  } else if (input.overdueTaskCount > 0) {
    sentences.push(
      `${input.overdueTaskCount} KurvzOS task${input.overdueTaskCount === 1 ? " is" : "s are"} overdue and worth a look.`
    );
  }

  // Cap at three sentences even if every branch above fired.
  return sentences.slice(0, 3).join(" ");
}
