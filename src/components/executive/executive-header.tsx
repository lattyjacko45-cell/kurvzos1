import { EXECUTIVES, type ExecutiveProfile } from "@/config/executives";
import { PageHeader } from "@/components/ui/page-header";

interface ExecutiveHeaderProps {
  id: ExecutiveProfile["id"];
}

/**
 * The identity header shared by all five executive workspaces.
 *
 * Every field comes from the `EXECUTIVES` roster, which is what makes this an
 * identity rather than five similar-looking headers: the role, name and
 * responsibility a person reads on a workspace page are now literally the same
 * strings they read on the roster card, so the two surfaces cannot drift.
 *
 * Previously each page hand-wrote its own PageHeader with a bespoke
 * description, so Renee's card promised one thing and Renee's page another.
 *
 * Deliberately carries no biography, portrait, credential or character art —
 * identity here comes from role, hierarchy and the existing responsibility
 * statement only.
 */
export function ExecutiveHeader({ id }: ExecutiveHeaderProps) {
  const executive = EXECUTIVES.find((candidate) => candidate.id === id);
  if (!executive) return null;

  return (
    <PageHeader
      eyebrow={executive.role}
      title={executive.name}
      description={executive.description}
    />
  );
}
