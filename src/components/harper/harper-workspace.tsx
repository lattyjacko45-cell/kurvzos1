"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MAX_QUESTION_LENGTH } from "@/lib/harper/prompt";
import type { HarperAnswer, HarperSource } from "@/lib/harper/types";
import { SectionLabel } from "@/components/ui/section-label";

export interface HarperHistoryEntry {
  id: string;
  createdAt: string;
  userMessage: string | null;
  advice: HarperAnswer;
  source: HarperSource;
}

interface HarperWorkspaceProps {
  initialAdvice: HarperAnswer | null;
  initialSource: HarperSource | null;
  /** Saved advice was discarded because the workspace changed underneath it. */
  wasStale?: boolean;
  history: HarperHistoryEntry[];
  aiConfigured: boolean;
  missingEnv: string[];
}

const SUGGESTIONS = [
  "What should I work on next?",
  "Am I falling behind?",
  "What can I postpone?",
  "Help me plan today.",
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

export function HarperWorkspace({
  initialAdvice,
  initialSource,
  wasStale = false,
  history,
  aiConfigured,
  missingEnv,
}: HarperWorkspaceProps) {
  const router = useRouter();
  const [advice, setAdvice] = useState<HarperAnswer | null>(initialAdvice);
  const [source, setSource] = useState<HarperSource | null>(initialSource);
  const [question, setQuestion] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  async function ask(prompt: string | null) {
    if (isThinking) return;

    setIsThinking(true);

    try {
      const response = await fetch("/api/harper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Harper could not respond.");
      }

      const result = (await response.json()) as {
        advice: HarperAnswer;
        source: HarperSource;
      };

      setAdvice(result.advice);
      setSource(result.source);
      setQuestion("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Harper could not respond."
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
          aria-labelledby="harper-setup-heading"
          className="space-y-3 rounded-2xl border border-dashed p-5"
        >
          <SectionLabel as="h2" id={"harper-setup-heading"}>
            Model provider not configured
          </SectionLabel>

          <p className="text-sm text-muted-foreground">
            Harper is running on deterministic rules. Set these to enable
            reasoning over your workspace:
          </p>

          <ul className="space-y-1 font-mono text-xs">
            {missingEnv.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="harper-advice-heading"
        className="space-y-5 rounded-2xl border bg-card p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel as="h2" id={"harper-advice-heading"}>
            Harper&apos;s read
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
              <SparklesIcon />
            )}
            Refresh advice
          </Button>
        </div>

        <div aria-live="polite" className="space-y-5">
          {advice ? (
            <>
              <AdviceBlock
                label="Current priority"
                value={advice.currentPriority}
              />
              <AdviceBlock label="Next move" value={advice.nextMove} />
              <AdviceBlock
                label="Why this matters"
                value={advice.whyThisMatters}
              />
              <AdviceBlock label="Watch out for" value={advice.watchOutFor} />
              <AdviceBlock label="Harper's answer" value={advice.answer} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask Harper a question or refresh to get today&apos;s read.
            </p>
          )}
        </div>

        {source === "FALLBACK" ? (
          <p className="text-xs text-muted-foreground">
            {wasStale
              ? "Your workspace changed since Harper last ran, so this is an updated rule-based read. Refresh for a full review."
              : "Rule-based recommendation — no model was used."}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="ask-harper-heading" className="space-y-4">
        <SectionLabel as="h2" id={"ask-harper-heading"}>
          Ask Harper
        </SectionLabel>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="harper-question" className="sr-only">
              Your question for Harper
            </Label>

            <Input
              id="harper-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What should I work on next?"
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

          <section aria-labelledby="harper-history-heading" className="space-y-4">
            <SectionLabel as="h2" id={"harper-history-heading"}>
              Recent advice
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

                  <p className="leading-6">{entry.advice.nextMove}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
