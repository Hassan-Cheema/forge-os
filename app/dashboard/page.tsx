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

  const { data: reports } = await supabase
    .from("reports")
    .select("id, prompt, content, type, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <AgentRunner
      userId={user.id}
      userEmail={user.email ?? ""}
      reports={(reports as Report[]) ?? []}
      signOut={signOut}
    />
  );
}
