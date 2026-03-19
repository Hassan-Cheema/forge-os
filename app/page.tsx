import Link from "next/link";

const features = [
  {
    icon: "🤖",
    title: "Multi-agent intelligence",
    description:
      "Describe any task in plain English. forge-os decomposes it into a team of specialist agents that run in parallel, then synthesises one clean answer.",
  },
  {
    icon: "🔍",
    title: "Real-time web search",
    description:
      "Agents get live DuckDuckGo results on every run. No API key required — just call /api/search?q=your+query from anywhere in your app.",
  },
  {
    icon: "🔐",
    title: "Auth out of the box",
    description:
      "Supabase-powered login and signup. Email confirmation, Google OAuth, session management, and protected routes — all wired up and ready.",
  },
  {
    icon: "🛡️",
    title: "Risk-based approvals",
    description:
      "Every agent action is scored 1–10 before it runs. High-risk actions are queued for human review. You stay in control of what your agents do.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-zinc-900 px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">forge-os</span>
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-zinc-100 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-32 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400"></span>
            Now in beta — free to get started
          </div>
          <h1 className="text-5xl font-bold tracking-tight leading-tight sm:text-6xl">
            AI agents that
            <br />
            <span className="text-zinc-400">actually get things done</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400 leading-relaxed">
            forge-os breaks your task into a parallel team of agents, runs them with live web search, and delivers one complete answer — with a risk-based approval gate so you stay in control.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/auth/signup"
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 transition-colors"
            >
              Start building for free
            </Link>
            <Link
              href="#features"
              className="rounded-lg border border-zinc-800 px-6 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-zinc-900 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-3xl font-bold">Everything your agents need</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-700 transition-colors"
              >
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="mb-2 text-base font-semibold">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-zinc-900 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-10 text-center text-3xl font-bold">How it works</h2>
          <div className="space-y-4">
            {[
              { step: "01", title: "Describe your task", desc: "Type anything — research, reports, LaTeX papers, comparisons. Plain English works." },
              { step: "02", title: "Agents plan and run", desc: "Claude decomposes your request into 2–5 specialist agents. They search the web and work in parallel." },
              { step: "03", title: "Review and approve", desc: "High-risk actions surface for your approval before they execute. You stay in control." },
              { step: "04", title: "Get your answer", desc: "One clean, synthesised result — ready to download as markdown or LaTeX." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-5 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
                <span className="shrink-0 font-mono text-sm font-bold text-zinc-700">{step}</span>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Search demo */}
      <section className="border-t border-zinc-900 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8">
            <p className="mb-3 text-xs font-mono text-zinc-500">GET /api/search?q=latest+AI+research</p>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-300 leading-relaxed">
{`{
  "query": "latest AI research",
  "abstract": "Artificial intelligence research encompasses...",
  "relatedTopics": [
    { "text": "Large language models", "url": "..." },
    { "text": "Reinforcement learning", "url": "..." }
  ]
}`}
            </pre>
            <p className="mt-4 text-sm text-zinc-400">
              One endpoint. Live DuckDuckGo data. No API key needed.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-900 px-6 py-24 text-center">
        <div className="mx-auto max-w-xl">
          <h2 className="text-3xl font-bold">Ready to launch your agents?</h2>
          <p className="mt-4 text-zinc-400">Free to use. No credit card required.</p>
          <Link
            href="/auth/signup"
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 transition-colors"
          >
            Get started for free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col items-center justify-between gap-4 border-t border-zinc-900 px-6 py-10 text-sm text-zinc-500 sm:flex-row">
        <span className="font-medium text-zinc-400">forge-os</span>
        <span>Built with Next.js · Supabase · Claude</span>
      </footer>
    </div>
  );
}
