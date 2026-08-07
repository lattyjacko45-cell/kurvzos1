/**
 * Development-only pre-flight list for the first live YouTube upload.
 *
 * Rendered by the Content page only when NODE_ENV is not production, so it
 * cannot appear for a real user.
 */

const CHECKLIST = [
  "Use a short throwaway video — 10 to 30 seconds is enough to prove the pipeline.",
  "Schedule at least one hour ahead so the publish time is comfortably in the future.",
  "Confirm the connected channel above is the one you intend to publish to.",
  "Confirm privacy is private: scheduled uploads go up private and stay private until the publish time.",
  "Do not use Publish Now during testing — it makes the video public immediately.",
  "After uploading, verify the video appears in YouTube Studio with the expected schedule.",
] as const;

export function TestUploadChecklist() {
  return (
    <section
      aria-labelledby="test-upload-heading"
      className="space-y-3 rounded-2xl border border-dashed p-5"
    >
      <div className="space-y-1">
        <h2
          id="test-upload-heading"
          className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
        >
          Test upload checklist
        </h2>

        <p className="text-sm text-muted-foreground">
          Shown in development only.
        </p>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {CHECKLIST.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}
