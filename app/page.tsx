import Link from "next/link";

const features = [
  {
    icon: "🔍",
    title: "Real-time search",
    description:
      "Give your agents live web data via DuckDuckGo. No API key required — just call /api/search?q=your+query.",
  },
  {
    icon: "🔐",
    title: "Auth out of the box",
    description:
      "Supabase-powered login and signup. Email confirmation, session management, and protected routes — all wired up.",
  },
  {
    icon: "💳",
    title: "Built-in payments",
    description:
      "Stripe subscriptions ready to go. Drop in your price ID and start collecting recurring revenue immediately.",
  },
];

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    description: "For hobbyists and side projects",
    features: ["1 agent", "100 searches/month", "Community support"],
    priceId: null,
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For teams shipping production agents",
    features: ["Unlimited agents", "10,000 searches/month", "Priority support", "Webhooks"],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    cta: "Start free trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large-scale deployments",
    features: ["Unlimited everything", "SLA guarantee", "Dedicated support", "Custom contracts"],
    priceId: null,
    cta: "Contact us",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
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
            Build AI agents
            <br />
            <span className="text-zinc-400">that actually ship</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400 leading-relaxed">
            forge-os gives your agents real-time search, user authentication, and payments — everything wired up so you can skip the boilerplate.
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
          <h2 className="mb-12 text-center text-3xl font-bold">Everything your agent needs</h2>
          <div className="grid gap-6 sm:grid-cols-3">
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

      {/* Search demo hint */}
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

      {/* Pricing */}
      <section id="pricing" className="border-t border-zinc-900 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold">Simple pricing</h2>
          <p className="mb-12 text-center text-zinc-400">Start free. Upgrade when you need more.</p>
          <div className="grid gap-6 sm:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-6 ${
                  plan.highlighted
                    ? "border-white bg-white text-zinc-950"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <div className="mb-4">
                  <p className={`text-sm font-medium ${plan.highlighted ? "text-zinc-600" : "text-zinc-400"}`}>
                    {plan.name}
                  </p>
                  <p className="mt-1 text-3xl font-bold">
                    {plan.price}
                    {plan.period && (
                      <span className={`text-base font-normal ${plan.highlighted ? "text-zinc-500" : "text-zinc-500"}`}>
                        {plan.period}
                      </span>
                    )}
                  </p>
                  <p className={`mt-1 text-sm ${plan.highlighted ? "text-zinc-600" : "text-zinc-400"}`}>
                    {plan.description}
                  </p>
                </div>

                <ul className="mb-6 space-y-2">
                  {plan.features.map((feat) => (
                    <li
                      key={feat}
                      className={`flex items-center gap-2 text-sm ${plan.highlighted ? "text-zinc-700" : "text-zinc-300"}`}
                    >
                      <span className={plan.highlighted ? "text-zinc-900" : "text-zinc-400"}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/auth/signup"
                  className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                    plan.highlighted
                      ? "bg-zinc-950 text-white hover:bg-zinc-800"
                      : "border border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-white"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 px-6 py-10">
        <div className="mx-auto max-w-5xl flex flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row">
          <span className="font-medium text-zinc-400">forge-os</span>
          <span>Built with Next.js · Supabase · Stripe</span>
        </div>
      </footer>
    </div>
  );
}
