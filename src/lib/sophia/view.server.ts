import { humanizeAdvice } from "@/lib/executives/language";
import { buildSophiaContext } from "@/lib/sophia/context.server";
import { getLatestSophiaAdvice } from "@/lib/sophia/engine.server";
import { buildSophiaFallback } from "@/lib/sophia/fallback";
import {
  isSophiaContextStale,
  parseStoredSophiaContext,
} from "@/lib/sophia/staleness";
import {
  sophiaAnswerSchema,
  type SophiaAnswer,
  type SophiaContext,
  type SophiaSource,
} from "@/lib/sophia/types";

export interface SophiaView {
  advice: SophiaAnswer;
  source: SophiaSource;
  wasStale: boolean;
  context: SophiaContext;
}

/**
 * What Sophia should be showing right now. Saved advice is reused only while
 * its snapshot still matches the live pipeline. No model call happens here.
 */
export async function getSophiaView(
  profileId: string,
  workspaceId: string
): Promise<SophiaView> {
  const context = await buildSophiaContext(profileId, workspaceId);
  const latest = await getLatestSophiaAdvice(profileId);

  const savedContext = latest
    ? parseStoredSophiaContext(latest.contextSnapshot)
    : null;
  const savedAdvice = latest
    ? sophiaAnswerSchema.safeParse(latest.response)
    : null;

  const stale = isSophiaContextStale(savedContext, context);

  if (!stale && savedAdvice?.success) {
    const source: SophiaSource =
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
    advice: humanizeAdvice(buildSophiaFallback(context, null)),
    source: "FALLBACK",
    wasStale: Boolean(latest),
    context,
  };
}
