import { SectionLabel } from "@/components/ui/section-label";
import type { MorningBrief, MorningBriefEmailRow } from "@/lib/morning-brief.server";

interface RecommendationCalloutProps {
  brief: MorningBrief<MorningBriefEmailRow>;
}

/** The closing Chief of Staff recommendation — two to three sentences, never
 *  a long essay, whether it came from the model or the deterministic path. */
export function RecommendationCallout({ brief }: RecommendationCalloutProps) {
  return (
    <section className="rounded-2xl border bg-card p-8">
      <SectionLabel as="h2">Harper&apos;s Recommendation</SectionLabel>

      <p className="mt-3 font-serif text-display-sm leading-snug">
        {brief.recommendation.text}
      </p>

      {brief.recommendation.source === "FALLBACK" ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Rule-based recommendation — no model was used.
        </p>
      ) : null}
    </section>
  );
}
