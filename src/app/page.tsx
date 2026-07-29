export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl px-8 py-16">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">KurvzOS</h1>

          <a
            href="/login"
            className="rounded-lg border px-4 py-2 hover:bg-gray-100"
          >
            Sign In
          </a>
        </header>

        <section className="mt-28">
          <p className="text-sm uppercase tracking-widest text-gray-500">
            Your Execution Operating System
          </p>

          <h2 className="mt-6 max-w-4xl text-6xl font-bold">
            Know what to do next—
            <br />
            and why it matters.
          </h2>

          <p className="mt-8 max-w-2xl text-xl text-gray-600">
            KurvzOS helps you turn your vision into focused execution by guiding
            you from Vision → Outcome → Mission → Action.
          </p>

          <div className="mt-12 flex gap-4">
            <a
              href="/signup"
              className="rounded-lg bg-black px-6 py-3 text-white"
            >
              Start Your Mission
            </a>

            <a
              href="/login"
              className="rounded-lg border px-6 py-3"
            >
              Sign In
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}