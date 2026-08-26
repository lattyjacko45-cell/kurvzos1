import Link from "next/link";

import { SectionLabel } from "@/components/ui/section-label";

interface LegalPageProps {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}

/**
 * Shared chrome for the public legal pages (/privacy, /terms).
 *
 * Deliberately mirrors the root marketing page's own header/footer markup
 * (plain gray/white palette, serif display heading) rather than the app
 * shell's warm-stone theme tokens — that plain style is what the existing
 * public page (`src/app/page.tsx`) already established as "the public-page
 * layout," so this reuses it rather than introducing a second look.
 */
export function LegalPage({ title, effectiveDate, children }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <div className="mx-auto max-w-3xl px-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-gray-200 py-6">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            KurvzOS
          </Link>

          <Link
            href="/"
            className="text-sm font-medium text-gray-700 transition hover:text-black"
          >
            Back to KurvzOS
          </Link>
        </header>

        <article className="py-16 sm:py-20">
          <SectionLabel>KurvzOS</SectionLabel>

          <h1 className="mt-4 font-serif text-display-lg sm:text-4xl">
            {title}
          </h1>

          <p className="mt-3 text-sm text-gray-500">
            Effective date: {effectiveDate}
          </p>

          <div className="legal-content mt-12 max-w-none">{children}</div>
        </article>

        <footer className="flex flex-col gap-4 border-t border-gray-200 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 KurvzOS.</p>

          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-black">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-black">
              Terms of Use
            </Link>
            <Link href="/" className="hover:text-black">
              Home
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

/** One numbered section: a heading plus its body content. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-xl font-semibold text-gray-950">{title}</h2>
      <div className="mt-3 space-y-4 leading-7 text-gray-600">{children}</div>
    </section>
  );
}

/** Bulleted list styled consistently with the rest of the legal body copy. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
