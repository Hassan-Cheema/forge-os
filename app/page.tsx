import Link from "next/link";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconAgents({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v4M12 11l-5 6M12 11l5 6" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 3 7v5c0 5.25 3.75 10.15 9 11.35C18.25 22.15 22 17.25 22 12V7z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Dashboard Mockup ─────────────────────────────────────────────────────────

function DashboardMockup() {
  return (
    <div className="relative mx-auto mt-20 max-w-3xl px-4 sm:px-0">
      {/* Glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-3xl"
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0d0d0d] shadow-[0_0_120px_rgba(0,0,0,0.8)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.07] bg-[#111111] px-4 py-3.5">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]/80" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]/80" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]/80" />
          </div>
          <div className="ml-4 flex-1 rounded-md bg-white/[0.06] px-3 py-1.5 text-center text-xs text-zinc-600">
            forge-os.app/dashboard
          </div>
        </div>

        {/* Dashboard body */}
        <div className="p-5">
          {/* Prompt bar */}
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-4 py-3">
            <div className="h-2 flex-1 rounded-full bg-white/[0.08]" />
            <div className="h-2 w-24 rounded-full bg-white/[0.05]" />
            <div className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-950 shadow-sm">
              Launch agents →
            </div>
          </div>

          {/* Agent cards */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {[
              { label: "🔍 Researcher", state: "done" },
              { label: "📝 Writer",     state: "running" },
              { label: "📊 Analyst",    state: "running" },
            ].map(({ label, state }) => (
              <div
                key={label}
                className={`rounded-xl border px-3 py-2.5 transition-all ${
                  state === "done"
                    ? "border-green-900/60 bg-green-950/25"
                    : "border-blue-900/60 bg-blue-950/25"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      state === "done" ? "bg-green-500" : "bg-blue-400"
                    }`}
                  />
                  <span className="text-xs text-zinc-300">{label}</span>
                </div>
                {state === "running" && (
                  <div className="mt-2 space-y-1.5">
                    <div className="h-1 rounded-full bg-white/[0.07]" />
                    <div className="h-1 w-2/3 rounded-full bg-white/[0.07]" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Answer panel */}
          <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm">✨</span>
              <span className="text-xs font-semibold text-white">Answer</span>
              <span className="flex gap-0.5 text-zinc-700">
                <span className="animate-bounce text-[10px]">·</span>
                <span className="animate-bounce text-[10px] [animation-delay:75ms]">·</span>
                <span className="animate-bounce text-[10px] [animation-delay:150ms]">·</span>
              </span>
            </div>
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-white/[0.08]" />
              <div className="h-2 w-11/12 rounded-full bg-white/[0.08]" />
              <div className="h-2 w-4/5 rounded-full bg-white/[0.08]" />
              <div className="h-2 rounded-full bg-white/[0.08]" />
              <div className="h-2 w-3/5 rounded-full bg-white/[0.08]" />
            </div>
          </div>
        </div>
      </div>

      {/* Side gradient fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#080808] to-transparent"
      />
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const features = [
  {
    Icon: IconAgents,
    title: "Multi-agent intelligence",
    description:
      "Describe any goal in plain English. forge-os decomposes it into a parallel team of specialist agents, runs them simultaneously, and synthesises one clean answer — no glue code required.",
    wide: true,
  },
  {
    Icon: IconSearch,
    title: "Live web search",
    description:
      "Every agent has real-time DuckDuckGo results baked in. No third-party key, no setup — call /api/search from anywhere in your stack.",
    wide: false,
  },
  {
    Icon: IconLock,
    title: "Auth, zero config",
    description:
      "Email + Google OAuth, session management, and protected routes — all wired up via Supabase SSR from the first commit.",
    wide: false,
  },
  {
    Icon: IconShield,
    title: "Risk-based approvals",
    description:
      "Every action is scored 1–10 before it runs. Anything above your threshold is queued for your review. You stay in control.",
    wide: false,
  },
];

const steps = [
  {
    num: "01",
    title: "Describe your task",
    desc: "Type any goal — research, reports, academic papers, comparisons. Plain English, any complexity.",
  },
  {
    num: "02",
    title: "Agents plan and run",
    desc: "Claude decomposes your request into 2–5 specialist agents. They search the web and execute in parallel.",
  },
  {
    num: "03",
    title: "You stay in control",
    desc: "High-risk actions surface for your approval before they run. Full audit trail in the dashboard.",
  },
  {
    num: "04",
    title: "Get your answer",
    desc: "One clean synthesised result, ready to download as Markdown or LaTeX.",
  },
];

const stats = [
  { value: "2–5",  label: "Agents per task" },
  { value: "<30s", label: "Avg. completion" },
  { value: "1–10", label: "Risk scoring" },
  { value: "Free", label: "To get started" },
];

const stack = ["Anthropic Claude", "Supabase", "Next.js", "Vercel"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-white">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080808]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-bold tracking-tight text-white">
            forge-os
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-zinc-400 sm:flex">
            <Link href="#features"    className="transition-colors hover:text-white">Features</Link>
            <Link href="#how-it-works" className="transition-colors hover:text-white">How it works</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="hidden text-sm text-zinc-400 transition-colors hover:text-white sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden px-6 pb-0 pt-28 text-center sm:pt-36">
          {/* Grid background */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff07_1px,transparent_1px),linear-gradient(to_bottom,#ffffff07_1px,transparent_1px)] bg-[size:56px_56px]"
          />
          {/* Radial highlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,#ffffff0b_0%,transparent_100%)]"
          />
          {/* Bottom fade */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#080808] to-transparent"
          />

          <div className="relative mx-auto max-w-4xl">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Now in beta — free to get started
            </div>

            <h1 className="text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-[72px]">
              Your AI team,
              <br />
              <span className="bg-gradient-to-br from-white via-zinc-200 to-zinc-600 bg-clip-text text-transparent">
                ready in seconds.
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-lg text-lg leading-relaxed text-zinc-400">
              Type any goal. forge-os breaks it into a parallel swarm of AI agents, arms them with live web search, and delivers one polished answer — with a risk gate so you stay in control.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/auth/signup"
                className="group inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-zinc-950 shadow-[0_0_40px_rgba(255,255,255,0.12)] transition-all hover:bg-zinc-100 hover:shadow-[0_0_60px_rgba(255,255,255,0.18)]"
              >
                Start for free
                <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] px-7 py-3.5 text-sm font-medium text-zinc-300 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
              >
                See how it works
              </Link>
            </div>
          </div>

          {/* Dashboard mockup */}
          <DashboardMockup />
        </section>

        {/* ── Stats bar ───────────────────────────────────────────────────── */}
        <section className="border-y border-white/[0.06] px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <dl className="grid grid-cols-2 gap-y-10 sm:grid-cols-4">
              {stats.map(({ value, label }) => (
                <div key={label} className="text-center">
                  <dt className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                    {value}
                  </dt>
                  <dd className="mt-1.5 text-sm text-zinc-500">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Powered-by trust bar ─────────────────────────────────────────── */}
        <section className="px-6 py-12">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Powered by world-class infrastructure
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {stack.map((name, i) => (
                <span key={name} className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
                  {name}
                  {i < stack.length - 1 && (
                    <span className="h-4 w-px bg-white/[0.1]" />
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────────── */}
        <section id="features" className="border-t border-white/[0.06] px-6 py-28">
          <div className="mx-auto max-w-5xl">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Platform
            </p>
            <h2 className="mb-16 text-center text-4xl font-bold tracking-tight">
              Built for production
              <br />
              <span className="text-zinc-500">from day one</span>
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((f, i) => (
                <div
                  key={f.title}
                  className={`group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.04] ${
                    i === 0 ? "sm:col-span-2" : ""
                  }`}
                >
                  {/* Inner glow on hover */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  {/* Icon container */}
                  <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05]">
                    <f.Icon className="h-5 w-5 text-zinc-300" />
                  </div>
                  <h3 className="mb-2.5 text-base font-semibold text-white">{f.title}</h3>
                  <p className="max-w-lg text-sm leading-relaxed text-zinc-400">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────────────── */}
        <section id="how-it-works" className="border-t border-white/[0.06] px-6 py-28">
          <div className="mx-auto max-w-2xl">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Workflow
            </p>
            <h2 className="mb-16 text-center text-4xl font-bold tracking-tight">
              From prompt to answer
              <br />
              <span className="text-zinc-500">in four steps</span>
            </h2>

            <div className="relative">
              {/* Connecting line */}
              <div
                aria-hidden
                className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-white/10 via-white/[0.07] to-transparent"
              />
              <div className="space-y-6">
                {steps.map(({ num, title, desc }) => (
                  <div key={num} className="flex gap-6">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-[#0f0f0f] font-mono text-xs font-bold text-zinc-400">
                      {num}
                    </div>
                    <div className="py-2">
                      <p className="font-semibold text-white">{title}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Terminal demo ───────────────────────────────────────────────── */}
        <section className="border-t border-white/[0.06] px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Search API
            </p>
            <h2 className="mb-10 text-center text-3xl font-bold tracking-tight">
              One endpoint. Live data.
            </h2>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0d0d] shadow-2xl shadow-black/60">
              {/* Terminal chrome */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#111111] px-4 py-3.5">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[#ff5f57]/70" />
                  <div className="h-3 w-3 rounded-full bg-[#febc2e]/70" />
                  <div className="h-3 w-3 rounded-full bg-[#28c840]/70" />
                </div>
                <span className="ml-3 text-xs text-zinc-600">forge-os — search API</span>
              </div>
              <div className="p-6">
                <p className="mb-4 font-mono text-xs text-zinc-400">
                  <span className="text-emerald-500/80">$</span>{" "}
                  curl &quot;/api/search?q=latest+AI+research&quot;
                </p>
                <pre className="overflow-x-auto rounded-xl bg-[#080808] px-5 py-4 font-mono text-xs leading-relaxed text-zinc-300">
{`{
  "query": "latest AI research",
  "abstract": "Artificial intelligence research in 2025 spans
               large language models, multi-agent systems...",
  "relatedTopics": [
    { "text": "Large language models",   "url": "..." },
    { "text": "Reinforcement learning",  "url": "..." },
    { "text": "Multi-agent systems",     "url": "..." }
  ]
}`}
                </pre>
                <p className="mt-5 text-sm text-zinc-400">
                  No API key. No rate limits on your side. Just results.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden border-t border-white/[0.06] px-6 py-40 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,#ffffff0a_0%,transparent_100%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:56px_56px]"
          />
          <div className="relative mx-auto max-w-2xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Get started today
            </p>
            <h2 className="text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              Your agents are
              <br />
              waiting to run.
            </h2>
            <p className="mx-auto mt-6 max-w-sm text-lg text-zinc-400">
              Free forever. No credit card. Live in minutes.
            </p>
            <Link
              href="/auth/signup"
              className="group mt-10 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-sm font-semibold text-zinc-950 shadow-[0_0_60px_rgba(255,255,255,0.15)] transition-all hover:bg-zinc-100 hover:shadow-[0_0_80px_rgba(255,255,255,0.2)]"
            >
              Launch your first agent
              <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-4 text-sm text-zinc-500">
              No credit card. Free forever. Takes 30 seconds to start.
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-12 sm:flex-row">
            <div className="max-w-xs">
              <p className="text-sm font-bold tracking-tight text-white">forge-os</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Autonomous AI agents for every task. Powered by Claude.
              </p>
            </div>
            <div className="flex gap-16 text-sm">
              <div>
                <p className="mb-4 font-medium text-zinc-400">Product</p>
                <ul className="space-y-3 text-zinc-500">
                  <li>
                    <Link href="/auth/signup" className="transition-colors hover:text-white">
                      Get started
                    </Link>
                  </li>
                  <li>
                    <Link href="/auth/login" className="transition-colors hover:text-white">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link href="#features" className="transition-colors hover:text-white">
                      Features
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-4 font-medium text-zinc-400">Built with</p>
                <ul className="space-y-3 text-zinc-500">
                  <li>Next.js</li>
                  <li>Supabase</li>
                  <li>Anthropic Claude</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-white/[0.06] pt-8 text-xs text-zinc-700 sm:flex-row sm:items-center">
            <span>© 2026 forge-os. All rights reserved.</span>
            <span>The agent platform that ships.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
