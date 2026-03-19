import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AgentRunner from "./AgentRunner";

export interface Report {
  id: string;
  prompt: string;
  content: string;
  type: "research" | "latex";
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fetch reports for this user, newest first
  const { data: reports } = await supabase
    .from("reports")
    .select("id, prompt, content, type, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-zinc-900 px-6 py-4">
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
      </nav>

      {/* Agent runner — the whole product */}
      <AgentRunner userId={user.id} reports={(reports as Report[]) ?? []} />
    </div>
  );
}
