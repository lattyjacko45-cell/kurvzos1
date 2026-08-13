"use client";

import { useEffect } from "react";

import "./globals.css";

/**
 * The last-resort boundary, for failures in the root layout itself.
 *
 * `error.tsx` renders *inside* the root layout, so it cannot catch a failure
 * in the layout — the font loader, the theme provider, the toaster. This one
 * replaces the entire document, which is why it has to supply its own `<html>`
 * and `<body>`.
 *
 * Deliberately dependency-light: no shared UI components, no next/link. If the
 * root layout has failed, the safest assumption is that anything it set up is
 * unavailable, so this uses plain elements and a hard navigation. Styling is a
 * small inline subset of the KurvzOS tokens for the same reason — globals.css
 * is imported, but this must still be legible if it did not apply.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest only. Never the message or the stack.
    console.error("[kurvzos] root error", { digest: error.digest ?? null });
  }, [error.digest]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          background: "#f7f5f1",
          color: "#1c1a17",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "28rem",
            background: "#fffefc",
            border: "1px solid #e5e2db",
            borderRadius: "16px",
            padding: "2rem",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            KurvzOS could not start
          </h1>

          <p
            style={{
              marginTop: "0.5rem",
              marginBottom: "1.5rem",
              color: "#6e6a62",
              lineHeight: 1.6,
            }}
          >
            Something went wrong loading the application. Reloading usually
            resolves it.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              padding: "0.625rem 1rem",
              borderRadius: "8px",
              border: "none",
              background: "#55603c",
              color: "#fbfbf8",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload KurvzOS
          </button>
        </main>
      </body>
    </html>
  );
}
