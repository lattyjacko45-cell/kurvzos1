import { humanizeAdvice } from "@/lib/executives/language";
import { buildMarcusContext } from "@/lib/marcus/context.server";
import { getLatestMarcusAdvice } from "@/lib/marcus/engine.server";
import { buildMarcusFallback } from "@/lib/marcus/fallback";
import {
  isMarcusContextStale,
  parseStoredMarcusContext,
} from "@/lib/marcus/staleness";
import {
  marcusAnswerSchema,
  type MarcusAnswer,
  type MarcusContext,
  type MarcusSource,
} from "@/lib/marcus/types";

export interface MarcusView {
  advice: MarcusAnswer;
  source: MarcusSource;
  wasStale: boolean;
  context: MarcusContext;
}

/**
 * What Marcus should be showing right now. Saved advice is reused only while
 * its snapshot still matches the entered figures and current activity — stale
 * financial advice is worse than none. No model call happens here.
 */
export async function getMarcusView(
  profileId: string,
  workspaceId: string
): Promise<MarcusView> {
  const context = await buildMarcusContext(profileId, workspaceId);
  const latest = await getLatestMarcusAdvice(profileId);

  const savedContext = latest
    ? parseStoredMarcusContext(latest.contextSnapshot)
    : null;
  const savedAdvice = latest
    ? marcusAnswerSchema.safeParse(latest.response)
    : null;

  const stale = isMarcusContextStale(savedContext, context);

  if (!stale && savedAdvice?.success) {
    const source: MarcusSource =
      latest &&
      typeof latest.response === "object" &&
      latest.response !== null &&
      (latest.response as { source?: unknown }).source === "AI"
        ? "AI"
        : "FALLBACK";

    return {
      advice: humanizeAdvice(savedAdvice.data),
      source,
      wasStale: false,
      context,
    };
  }

  return {
    advice: humanizeAdvice(buildMarcusFallback(context, null)),
    source: "FALLBACK",
    wasStale: Boolean(latest),
    context,
  };
}
