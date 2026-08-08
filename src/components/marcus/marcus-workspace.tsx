"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, WalletIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MAX_QUESTION_LENGTH } from "@/lib/marcus/prompt";
import type { MarcusAnswer, MarcusSource } from "@/lib/marcus/types";
import { SectionLabel } from "@/components/ui/section-label";

export interface MarcusHistoryEntry {
  id: string;
  createdAt: string;
  userMessage: string | null;
  advice: MarcusAnswer;
  source: MarcusSource;
}

interface MarcusWorkspaceProps {
  initialAdvice: MarcusAnswer | null;
  initialSource: MarcusSource | null;
  wasStale?: boolean;
  history: MarcusHistoryEntry[];
  aiConfigured: boolean;
  missingEnv: string[];
  /** Shown verbatim so the user knows what would sharpen the advice. */
  missingFinancialData: string[];
}

const SUGGESTIONS = [
  "What should I spend money on next?",
  "Where should I cut back?",
  "Can I afford this project?",
  "What is my clearest revenue opportunity?",
  "Am I protecting enough cash?",
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

export function MarcusWorkspace({
  initialAdvice,
  initialSource,
  wasStale = false,
  history,
  aiConfigured,
  missingEnv,
  missingFinancialData,
}: MarcusWorkspaceProps) {
  const router = useRouter();
  const [advice, setAdvice] = useState<MarcusAnswer | null>(initialAdvice);
  const [source, setSource] = useState<MarcusSource | null>(initialSource);
  const [question, setQuestion] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  async function ask(prompt: string | null) {
    if (isThinking) return;

    setIsThinking(true);

    try {
      const response = await fetch("/api/marcus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Marcus could not respond.");
      }

      const result = (await response.json()) as {
        advice: MarcusAnswer;
        source: MarcusSource;
      };

      setAdvice(result.advice);
      setSource(result.source);
      setQuestion("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Marcus could not respond."
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
          aria-labelledby="marcus-setup-heading"
          className="space-y-3 rounded-2xl border border-dashed p-5"
        >
          <SectionLabel as="h2" id={"marcus-setup-heading"}>
            Model provider not configured
          </SectionLabel>

          <p className="text-sm text-muted-foreground">
            Marcus is running on deterministic rules. Set these to enable
            financial reasoning:
          </p>

          <ul className="space-y-1 font-mono text-xs">
            {missingEnv.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {missingFinancialData.length > 0 ? (
        <section
          aria-labelledby="marcus-missing-heading"
          className="space-y-2 rounded-2xl border border-dashed p-5"
        >
          <SectionLabel as="h2" id={"marcus-missing-heading"}>
            Not yet recorded
          </SectionLabel>

          <ul className="space-y-1 text-sm text-muted-foreground">
            {missingFinancialData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="marcus-advice-heading"
        className="space-y-5 rounded-2xl border bg-card p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel as="h2" id={"marcus-advice-heading"}>
            Marcus&apos;s read
          </SectionLabel>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => ask(null)}
            disabled={isThinking}
          >
            {isThinking ? <Loader2 className="animate-spin" /> : <WalletIcon />}
            Refresh financial read
          </Button>
        </div>

        <div aria-live="polite" className="space-y-5">
          {advice ? (
            <>
              <AdviceBlock
                label="Financial priority"
                value={advice.financialPriority}
              />
              <AdviceBlock label="Cash position" value={advice.cashPosition} />
              <AdviceBlock
                label="Investment recommendation"
                value={advice.investmentRecommendation}
              />
              <AdviceBlock label="Cost to watch" value={advice.costToWatch} />
              <AdviceBlock
                label="Revenue opportunity"
                value={advice.revenueOpportunity}
              />
              <AdviceBlock
                label="Financial risk"
                value={advice.financialRisk}
              />
              <AdviceBlock
                label="Why this matters"
                value={advice.whyThisMatters}
              />
              <AdviceBlock label="Marcus's answer" value={advice.answer} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Enter this month&apos;s figures, then ask Marcus a question or
              refresh for a financial read.
            </p>
          )}
        </div>

        {source === "FALLBACK" ? (
          <p className="text-xs text-muted-foreground">
            {wasStale
              ? "Your figures or activity changed since Marcus last ran, so this is an updated rule-based read. Refresh for a full review."
              : "Rule-based financial read — no model was used."}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Decision support only — not tax, credit, legal or investment advice.
        </p>
      </section>

      <section aria-labelledby="ask-marcus-heading" className="space-y-4">
        <SectionLabel as="h2" id={"ask-marcus-heading"}>
          Ask Marcus
        </SectionLabel>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="marcus-question" className="sr-only">
              Your question for Marcus
            </Label>

            <Input
              id="marcus-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What should I spend money on next?"
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
            aria-labelledby="marcus-history-heading"
            className="space-y-4"
          >
            <SectionLabel as="h2" id={"marcus-history-heading"}>
              Recent financial reads
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
                    {entry.advice.investmentRecommendation}
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
