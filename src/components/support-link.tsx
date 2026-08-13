import {
  SUPPORT_SUBJECTS,
  normalizeSupportEmail,
  supportMailtoHref,
} from "@/lib/beta";

interface SupportLinkProps {
  /** Subject line for the message. Defaults to the general one. */
  subject?: string;
  /** Leading copy. Defaults to a neutral prompt. */
  label?: string;
  className?: string;
}

/**
 * The support contact, or nothing at all.
 *
 * Renders `null` when `NEXT_PUBLIC_SUPPORT_EMAIL` is unset or malformed, so an
 * unconfigured environment shows no orphaned "Need help?" line and no broken
 * mailto — which is the whole reason the check lives in a shared component
 * rather than being repeated at each call site.
 *
 * The env var is referenced literally here so Next inlines it.
 */
export function SupportLink({
  subject = SUPPORT_SUBJECTS.general,
  label = "Need help?",
  className,
}: SupportLinkProps) {
  const email = normalizeSupportEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
  if (!email) return null;

  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      {label}{" "}
      <a
        href={supportMailtoHref(email, subject)}
        className="underline underline-offset-4 hover:text-foreground"
      >
        {email}
      </a>
    </p>
  );
}
