import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AgentRunner from "./AgentRunner";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      {/* Nav */}
      <nav className="border-b border-zinc-900 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">forge-os</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-zinc-500 sm:block">{user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-zinc-400 transition-colors hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Payment success banner */}
      {justPaid && (
        <div className="border-b border-green-900 bg-green-950/40 px-6 py-3 text-center text-sm text-green-400">
          Payment successful — your subscription is now active.
        </div>
      )}

      {/* Agent runner — the whole product */}
      <AgentRunner />
    </div>
  );
}
