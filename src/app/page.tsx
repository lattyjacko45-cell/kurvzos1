import Link from "next/link";

const features = [
  {
    title: "Mission Control",
    description:
      "See the one priority that matters most today and the next actions that move it forward.",
  },
  {
    title: "AI Chief of Staff",
    description:
      "Turn your vision, goals, and deadlines into clear daily guidance without the overwhelm.",
  },
  {
    title: "Progress Dashboard",
    description:
      "Track weekly execution, completed missions, and the momentum building toward your outcome.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-gray-200 py-6">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            KurvzOS
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 sm:inline-flex"
            >
              Sign In
            </Link>
            <Link
  href="/signup"
  style={{ color: "white" }}
  className="rounded-lg bg-black px-4 py-2 text-sm font-medium transition hover:bg-gray-800"
>
  Get Started
</Link>
          </nav>
        </header>

        <section className="py-24 sm:py-32">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Your Execution Operating System
            </p>

            <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Turn your vision into
              <span className="block text-gray-500">daily execution.</span>
            </h1>

            <p className="mt-8 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">
              KurvzOS helps you decide what matters now, turn goals into focused
              missions, and build consistent progress without carrying your
              entire plan in your head.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
  href="/signup"
  style={{ color: "white" }}
  className="rounded-lg bg-black px-6 py-3 text-center font-medium transition hover:bg-gray-800"
>
  Start Your Mission
</Link>

              <a
                href="#features"
                className="rounded-lg border border-gray-300 px-6 py-3 text-center font-medium transition hover:bg-gray-100"
              >
                See How It Works
              </a>
            </div>

            <p className="mt-5 text-sm text-gray-500">
              Vision → Outcome → Mission → Action
            </p>
          </div>
        </section>

        <section
          id="features"
          className="border-t border-gray-200 py-20 sm:py-24"
        >
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Built for focused execution
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Less mental clutter. More meaningful progress.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-gray-200 p-6 transition hover:-translate-y-1 hover:shadow-lg"
              >
                <p className="text-sm font-semibold text-gray-400">
                  0{index + 1}
                </p>

                <h3 className="mt-8 text-xl font-semibold">{feature.title}</h3>

                <p className="mt-3 leading-7 text-gray-600">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-gray-200 py-20">
          <div className="rounded-3xl bg-gray-950 px-6 py-12 text-white sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
              Start with clarity
            </p>

            <div className="mt-4 flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                Know what to do next—and why it matters.
              </h2>

              <Link
  href="/signup"
  style={{ color: "black" }}
  className="rounded-lg bg-white px-6 py-3 text-center font-medium transition hover:bg-gray-200"
>
  Build Your Mission
</Link>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-gray-200 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 KurvzOS. Built for focused execution.</p>

          <div className="flex gap-5">
            <a href="#features" className="hover:text-black">
              Features
            </a>
            <Link href="/login" className="hover:text-black">
              Sign In
            </Link>
            <Link href="/signup" className="hover:text-black">
              Get Started
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}