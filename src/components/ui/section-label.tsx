import { cn } from "@/lib/utils";

/**
 * The single eyebrow label for KurvzOS.
 *
 * Replaces four competing variants that had accumulated across the app:
 * tracking-[0.28em], tracking-[0.24em], tracking-[0.2em] and
 * "uppercase tracking-wider", at two different sizes. One component, one look.
 *
 * Renders as <p> by default; pass `as="h2"` when it genuinely labels a section
 * for assistive technology.
 */
export function SectionLabel({
  children,
  className,
  as: Component = "p",
  ...props
}: React.ComponentProps<"p"> & { as?: "p" | "h2" | "h3" }) {
  return (
    <Component
      className={cn(
        "text-label font-semibold uppercase text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
