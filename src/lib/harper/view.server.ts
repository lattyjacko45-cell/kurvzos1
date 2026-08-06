import { buildHarperContext } from "@/lib/harper/context.server";
import { getLatestHarperAdvice } from "@/lib/harper/engine.server";
import { buildFallbackAdvice } from "@/lib/harper/fallback";
import { isContextStale, parseStoredContext } from "@/lib/harper/staleness";
import {
  harperAnswerSchema,
  type HarperAnswer,
  type HarperContext,
  type HarperSource,
} from "@/lib/harper/types";

export interface HarperView {
  advice: HarperAnswer;
  source: HarperSource;
  /** True when saved advice was discarded because the workspace moved on. */
  wasStale: boolean;
  context: HarperContext;
}

/**
 * What Harper should be showing *right now*.
 *
 * Saved advice is only reused while its snapshot still matches the live
 * context. The moment the workspace moves — a task completed, the mission
 * changed, a step checked — we discard it and return a deterministic
 * recommendation computed from current data. No model call happens here, so
 * this is safe to call on every render.
 */
export async function getHarperView(
  profileId: string,
  workspaceId: string
): Promise<HarperView> {
  const context = await buildHarperContext(profileId, workspaceId);
  const latest = await getLatestHarperAdvice(profileId);

  const savedContext = latest ? parseStoredContext(latest.contextSnapshot) : null;
  const savedAdvice = latest
    ? harperAnswerSchema.safeParse(latest.response)
    : null;

  const stale = isContextStale(savedContext, context);

  if (!stale && savedAdvice?.success) {
    const source: HarperSource =
      latest &&
      typeof latest.response === "object" &&
      latest.response !== null &&
      (latest.response as { source?: unknown }).source === "AI"
        ? "AI"
        : "FALLBACK";

    return { advice: savedAdvice.data, source, wasStale: false, context };
  }

  return {
    advice: buildFallbackAdvice(context, null),
    source: "FALLBACK",
    wasStale: Boolean(latest),
    context,
  };
}
