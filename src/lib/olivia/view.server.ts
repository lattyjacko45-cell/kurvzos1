import { humanizeAdvice } from "@/lib/executives/language";
import { buildOliviaContext } from "@/lib/olivia/context.server";
import { getLatestOliviaAdvice } from "@/lib/olivia/engine.server";
import { buildOliviaFallback } from "@/lib/olivia/fallback";
import {
  isOliviaContextStale,
  parseStoredOliviaContext,
} from "@/lib/olivia/staleness";
import {
  oliviaAnswerSchema,
  type OliviaAnswer,
  type OliviaContext,
  type OliviaSource,
} from "@/lib/olivia/types";

export interface OliviaView {
  advice: OliviaAnswer;
  source: OliviaSource;
  wasStale: boolean;
  context: OliviaContext;
}

/**
 * What Olivia should be showing right now. Saved advice is reused only while
 * its snapshot still matches the live workflow. No model call happens here.
 */
export async function getOliviaView(
  profileId: string,
  workspaceId: string,
  now: Date = new Date()
): Promise<OliviaView> {
  const context = await buildOliviaContext(profileId, workspaceId, now);
  const latest = await getLatestOliviaAdvice(profileId);

  const savedContext = latest
    ? parseStoredOliviaContext(latest.contextSnapshot)
    : null;
  const savedAdvice = latest
    ? oliviaAnswerSchema.safeParse(latest.response)
    : null;

  const stale = isOliviaContextStale(savedContext, context);

  if (!stale && savedAdvice?.success) {
    const source: OliviaSource =
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
    advice: humanizeAdvice(buildOliviaFallback(context, null)),
    source: "FALLBACK",
    wasStale: Boolean(latest),
    context,
  };
}
