import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const params = await searchParams;
  const justPaid = params.checkout === "success";

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">forge-os</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-16">
        {justPaid && (
          <div className="mb-8 rounded-xl border border-green-900 bg-green-950/50 px-5 py-4 text-sm text-green-400">
            Payment successful — your subscription is now active.
          </div>
        )}

        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">Signed in as {user.email}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Search API</p>
            <p className="mt-2 text-2xl font-bold">Ready</p>
            <p className="mt-1 text-sm text-zinc-400">
              <code className="text-xs text-zinc-300">/api/search?q=...</code>
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Auth</p>
            <p className="mt-2 text-2xl font-bold">Active</p>
            <p className="mt-1 text-sm text-zinc-400">Session via Supabase</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Payments</p>
            <p className="mt-2 text-2xl font-bold">Stripe</p>
            <p className="mt-1 text-sm text-zinc-400">Webhook endpoint live</p>
          </div>
        </div>
      </main>
    </div>
  );
}
