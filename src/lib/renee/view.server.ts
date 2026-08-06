import { humanizeAdvice } from "@/lib/executives/language";
import { buildReneeContext } from "@/lib/renee/context.server";
import { getLatestReneeAdvice } from "@/lib/renee/engine.server";
import { buildReneeFallback } from "@/lib/renee/fallback";
import {
  isReneeContextStale,
  parseStoredReneeContext,
} from "@/lib/renee/staleness";
import {
  reneeAnswerSchema,
  type ReneeAnswer,
  type ReneeContext,
  type ReneeSource,
} from "@/lib/renee/types";

export interface ReneeView {
  advice: ReneeAnswer;
  source: ReneeSource;
  wasStale: boolean;
  context: ReneeContext;
}

/**
 * What Renee should be showing right now.
 *
 * Saved advice is reused only while its snapshot still matches the live
 * portfolio. No model call happens here, so this is safe on every render.
 */
export async function getReneeView(
  profileId: string,
  workspaceId: string
): Promise<ReneeView> {
  const context = await buildReneeContext(profileId, workspaceId);
  const latest = await getLatestReneeAdvice(profileId);

  const savedContext = latest
    ? parseStoredReneeContext(latest.contextSnapshot)
    : null;
  const savedAdvice = latest
    ? reneeAnswerSchema.safeParse(latest.response)
    : null;

  const stale = isReneeContextStale(savedContext, context);

  if (!stale && savedAdvice?.success) {
    const source: ReneeSource =
      latest &&
      typeof latest.response === "object" &&
      latest.response !== null &&
      (latest.response as { source?: unknown }).source === "AI"
        ? "AI"
        : "FALLBACK";

    // Rows written before this guard existed are cleaned on the way out.
    return {
      advice: humanizeAdvice(savedAdvice.data),
      source,
      wasStale: false,
      context,
    };
  }

  return {
    advice: humanizeAdvice(buildReneeFallback(context, null)),
    source: "FALLBACK",
    wasStale: Boolean(latest),
    context,
  };
}
