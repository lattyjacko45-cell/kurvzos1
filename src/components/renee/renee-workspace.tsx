"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CompassIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MAX_QUESTION_LENGTH } from "@/lib/renee/prompt";
import type { ReneeAnswer, ReneeSource } from "@/lib/renee/types";
import { SectionLabel } from "@/components/ui/section-label";

export interface ReneeHistoryEntry {
  id: string;
  createdAt: string;
  userMessage: string | null;
  advice: ReneeAnswer;
  source: ReneeSource;
}

interface ReneeWorkspaceProps {
  initialAdvice: ReneeAnswer | null;
  initialSource: ReneeSource | null;
  wasStale?: boolean;
  history: ReneeHistoryEntry[];
  aiConfigured: boolean;
  missingEnv: string[];
}

const SUGGESTIONS = [
  "Are we focused on the right thing?",
  "What should I postpone?",
  "Which project has the most value?",
  "Is my current work aligned with my business goal?",
  "What is the biggest strategic risk?",
];

function AdviceBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <div className="space-y-1">
      <SectionLabel as="h3">
        {label}
      </SectionLabel>

      <p className="text-sm leading-6">{value}</p>
    </div>
  );
}

export function ReneeWorkspace({
  initialAdvice,
  initialSource,
  wasStale = false,
  history,
  aiConfigured,
  missingEnv,
}: ReneeWorkspaceProps) {
  const router = useRouter();
  const [advice, setAdvice] = useState<ReneeAnswer | null>(initialAdvice);
  const [source, setSource] = useState<ReneeSource | null>(initialSource);
  const [question, setQuestion] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  async function ask(prompt: string | null) {
    if (isThinking) return;

    setIsThinking(true);

    try {
      const response = await fetch("/api/renee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Renee could not respond.");
      }

      const result = (await response.json()) as {
        advice: ReneeAnswer;
        source: ReneeSource;
      };

      setAdvice(result.advice);
      setSource(result.source);
      setQuestion("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Renee could not respond."
      );
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmed = question.trim();
    if (!trimmed) return;

    ask(trimmed);
  }

  return (
    <div className="space-y-8">
      {!aiConfigured ? (
        <section
          aria-labelledby="renee-setup-heading"
          className="space-y-3 rounded-2xl border border-dashed p-5"
        >
          <SectionLabel as="h2" id={"renee-setup-heading"}>
            Model provider not configured
          </SectionLabel>

          <p className="text-sm text-muted-foreground">
            Renee is running on deterministic rules. Set these to enable
            strategic reasoning:
          </p>

          <ul className="space-y-1 font-mono text-xs">
            {missingEnv.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="renee-advice-heading"
        className="space-y-6 rounded-2xl border bg-card p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel as="h2" id={"renee-advice-heading"}>
            Renee&apos;s read
          </SectionLabel>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => ask(null)}
            disabled={isThinking}
          >
            {isThinking ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CompassIcon />
            )}
            Refresh strategy
          </Button>
        </div>

        <div aria-live="polite" className="space-y-5">
          {advice ? (
            <>
              <AdviceBlock
                label="Strategic priority"
                value={advice.strategicPriority}
              />
              <AdviceBlock
                label="Alignment check"
                value={advice.alignmentCheck}
              />
              <AdviceBlock
                label="Strategic recommendation"
                value={advice.strategicRecommendation}
              />
              <AdviceBlock
                label="What to deprioritize"
                value={advice.whatToDeprioritize}
              />
              <AdviceBlock
                label="Why this matters"
                value={advice.whyThisMatters}
              />
              <AdviceBlock label="Renee's answer" value={advice.answer} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask Renee a question or refresh to get a strategic read.
            </p>
          )}
        </div>

        {source === "FALLBACK" ? (
          <p className="text-xs text-muted-foreground">
            {wasStale
              ? "Your projects changed since Renee last ran, so this is an updated rule-based read. Refresh for a full review."
              : "Rule-based strategy — no model was used."}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="ask-renee-heading" className="space-y-4">
        <SectionLabel as="h2" id={"ask-renee-heading"}>
          Ask Renee
        </SectionLabel>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="renee-question" className="sr-only">
              Your question for Renee
            </Label>

            <Input
              id="renee-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Are we focused on the right thing?"
              maxLength={MAX_QUESTION_LENGTH}
              disabled={isThinking}
              className="h-9"
            />
          </div>

          <Button type="submit" disabled={isThinking || !question.trim()}>
            {isThinking && <Loader2 className="mr-2 size-4 animate-spin" />}
            Ask
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              size="sm"
              variant="outline"
              disabled={isThinking}
              onClick={() => ask(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </section>

      {history.length > 0 ? (
        <>
          <Separator />

          <section aria-labelledby="renee-history-heading" className="space-y-4">
            <SectionLabel as="h2" id={"renee-history-heading"}>
              Recent strategy
            </SectionLabel>

            <ul className="space-y-3">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="space-y-2 rounded-2xl border p-4 text-sm"
                >
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {entry.source === "FALLBACK" ? " · rule-based" : ""}
                  </p>

                  {entry.userMessage ? (
                    <p className="font-medium">“{entry.userMessage}”</p>
                  ) : null}

                  <p className="leading-6">
                    {entry.advice.strategicRecommendation}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
