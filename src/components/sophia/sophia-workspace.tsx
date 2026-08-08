"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MegaphoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MAX_QUESTION_LENGTH } from "@/lib/sophia/prompt";
import type { SophiaAnswer, SophiaSource } from "@/lib/sophia/types";
import { SectionLabel } from "@/components/ui/section-label";

export interface SophiaHistoryEntry {
  id: string;
  createdAt: string;
  userMessage: string | null;
  advice: SophiaAnswer;
  source: SophiaSource;
}

interface SophiaWorkspaceProps {
  initialAdvice: SophiaAnswer | null;
  initialSource: SophiaSource | null;
  wasStale?: boolean;
  history: SophiaHistoryEntry[];
  aiConfigured: boolean;
  missingEnv: string[];
}

const SUGGESTIONS = [
  "What should I publish next?",
  "Which content should I promote?",
  "Where is my content pipeline weak?",
  "Should I focus on YouTube or short-form?",
  "How can I repurpose what I already created?",
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

export function SophiaWorkspace({
  initialAdvice,
  initialSource,
  wasStale = false,
  history,
  aiConfigured,
  missingEnv,
}: SophiaWorkspaceProps) {
  const router = useRouter();
  const [advice, setAdvice] = useState<SophiaAnswer | null>(initialAdvice);
  const [source, setSource] = useState<SophiaSource | null>(initialSource);
  const [question, setQuestion] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  async function ask(prompt: string | null) {
    if (isThinking) return;

    setIsThinking(true);

    try {
      const response = await fetch("/api/sophia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Sophia could not respond.");
      }

      const result = (await response.json()) as {
        advice: SophiaAnswer;
        source: SophiaSource;
      };

      setAdvice(result.advice);
      setSource(result.source);
      setQuestion("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Sophia could not respond."
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
          aria-labelledby="sophia-setup-heading"
          className="space-y-3 rounded-2xl border border-dashed p-5"
        >
          <SectionLabel as="h2" id={"sophia-setup-heading"}>
            Model provider not configured
          </SectionLabel>

          <p className="text-sm text-muted-foreground">
            Sophia is running on deterministic rules. Set these to enable
            marketing reasoning:
          </p>

          <ul className="space-y-1 font-mono text-xs">
            {missingEnv.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="sophia-advice-heading"
        className="space-y-6 rounded-2xl border bg-card p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel as="h2" id={"sophia-advice-heading"}>
            Sophia&apos;s read
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
              <MegaphoneIcon />
            )}
            Refresh marketing read
          </Button>
        </div>

        <div aria-live="polite" className="space-y-5">
          {advice ? (
            <>
              <AdviceBlock
                label="Marketing priority"
                value={advice.marketingPriority}
              />
              <AdviceBlock
                label="Content recommendation"
                value={advice.contentRecommendation}
              />
              <AdviceBlock label="Channel focus" value={advice.channelFocus} />
              <AdviceBlock
                label="Promotion opportunity"
                value={advice.promotionOpportunity}
              />
              <AdviceBlock
                label="Marketing risk"
                value={advice.marketingRisk}
              />
              <AdviceBlock
                label="Why this matters"
                value={advice.whyThisMatters}
              />
              <AdviceBlock label="Sophia's answer" value={advice.answer} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask Sophia a question or refresh to get a marketing read.
            </p>
          )}
        </div>

        {source === "FALLBACK" ? (
          <p className="text-xs text-muted-foreground">
            {wasStale
              ? "Your content pipeline changed since Sophia last ran, so this is an updated rule-based read. Refresh for a full review."
              : "Rule-based marketing read — no model was used."}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="ask-sophia-heading" className="space-y-4">
        <SectionLabel as="h2" id={"ask-sophia-heading"}>
          Ask Sophia
        </SectionLabel>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="sophia-question" className="sr-only">
              Your question for Sophia
            </Label>

            <Input
              id="sophia-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What should I publish next?"
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

          <section
            aria-labelledby="sophia-history-heading"
            className="space-y-4"
          >
            <SectionLabel as="h2" id={"sophia-history-heading"}>
              Recent marketing reads
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
                    {entry.advice.contentRecommendation}
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
