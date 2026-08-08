import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/ui/section-label";

interface PageHeaderProps {
  /** Small eyebrow above the title, e.g. "Content Studio". */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Right-aligned action, e.g. a primary link or dialog trigger. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * The standard page header.
 *
 * Every page previously hand-rolled this block, which is how three different
 * title sizes and two eyebrow treatments crept in. The title is the one place
 * the display serif appears on most screens.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 pb-2",
        className
      )}
    >
      <div className="space-y-2">
        {eyebrow ? <SectionLabel>{eyebrow}</SectionLabel> : null}

        <h1 className="font-serif text-display-lg text-foreground">{title}</h1>

        {description ? (
          <p className="max-w-2xl text-body text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
