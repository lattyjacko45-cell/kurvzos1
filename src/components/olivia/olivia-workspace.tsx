"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, WorkflowIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MAX_QUESTION_LENGTH } from "@/lib/olivia/prompt";
import type { OliviaAnswer, OliviaSource } from "@/lib/olivia/types";

export interface OliviaHistoryEntry {
  id: string;
  createdAt: string;
  userMessage: string | null;
  advice: OliviaAnswer;
  source: OliviaSource;
}

interface OliviaWorkspaceProps {
  initialAdvice: OliviaAnswer | null;
  initialSource: OliviaSource | null;
  wasStale?: boolean;
  history: OliviaHistoryEntry[];
  aiConfigured: boolean;
  missingEnv: string[];
}

const SUGGESTIONS = [
  "What is slowing me down?",
  "Where is my workflow breaking?",
  "What should I systemize next?",
  "What can I delegate?",
  "Which project is operationally stuck?",
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
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </h3>

      <p className="text-sm leading-6">{value}</p>
    </div>
  );
}

export function OliviaWorkspace({
  initialAdvice,
  initialSource,
  wasStale = false,
  history,
  aiConfigured,
  missingEnv,
}: OliviaWorkspaceProps) {
  const router = useRouter();
  const [advice, setAdvice] = useState<OliviaAnswer | null>(initialAdvice);
  const [source, setSource] = useState<OliviaSource | null>(initialSource);
  const [question, setQuestion] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  async function ask(prompt: string | null) {
    if (isThinking) return;

    setIsThinking(true);

    try {
      const response = await fetch("/api/olivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Olivia could not respond.");
      }

      const result = (await response.json()) as {
        advice: OliviaAnswer;
        source: OliviaSource;
      };

      setAdvice(result.advice);
      setSource(result.source);
      setQuestion("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Olivia could not respond."
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
          aria-labelledby="olivia-setup-heading"
          className="space-y-3 rounded-2xl border border-dashed p-5"
        >
          <h2
            id="olivia-setup-heading"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
          >
            Model provider not configured
          </h2>

          <p className="text-sm text-muted-foreground">
            Olivia is running on deterministic rules. Set these to enable
            operational reasoning:
          </p>

          <ul className="space-y-1 font-mono text-xs">
            {missingEnv.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="olivia-advice-heading"
        className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="olivia-advice-heading"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
          >
            Olivia&apos;s read
          </h2>

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
              <WorkflowIcon />
            )}
            Refresh operations read
          </Button>
        </div>

        <div aria-live="polite" className="space-y-5">
          {advice ? (
            <>
              <AdviceBlock
                label="Operations priority"
                value={advice.operationsPriority}
              />
              <AdviceBlock
                label="Current bottleneck"
                value={advice.currentBottleneck}
              />
              <AdviceBlock
                label="Process recommendation"
                value={advice.processRecommendation}
              />
              <AdviceBlock
                label="System or delegation opportunity"
                value={advice.systemOrDelegationOpportunity}
              />
              <AdviceBlock
                label="Operations risk"
                value={advice.operationsRisk}
              />
              <AdviceBlock
                label="Why this matters"
                value={advice.whyThisMatters}
              />
              <AdviceBlock label="Olivia's answer" value={advice.answer} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask Olivia a question or refresh to get an operational read.
            </p>
          )}
        </div>

        {source === "FALLBACK" ? (
          <p className="text-xs text-muted-foreground">
            {wasStale
              ? "Your workflow changed since Olivia last ran, so this is an updated rule-based read. Refresh for a full review."
              : "Rule-based operations read — no model was used."}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="ask-olivia-heading" className="space-y-4">
        <h2
          id="ask-olivia-heading"
          className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
        >
          Ask Olivia
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="olivia-question" className="sr-only">
              Your question for Olivia
            </Label>

            <Input
              id="olivia-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What is slowing me down?"
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
            aria-labelledby="olivia-history-heading"
            className="space-y-4"
          >
            <h2
              id="olivia-history-heading"
              className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
            >
              Recent operations reads
            </h2>

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
                    {entry.advice.processRecommendation}
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
