import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// GET /api/agents/approvals?userId=...
export async function GET(req: NextRequest) {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await (supabase.from("pending_approvals") as any)
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ approvals: data ?? [] });
}

// POST /api/agents/approvals
// body: { id: string, action: "approve" | "reject" }
export async function POST(req: NextRequest) {
    try {
        const { id, action } = await req.json();

        if (!id || !["approve", "reject"].includes(action)) {
            return NextResponse.json(
                { error: "id and action ('approve' | 'reject') are required" },
                { status: 400 }
            );
        }

        const supabase = getSupabase();
        const { error } = await (supabase.from("pending_approvals") as any)
            .update({
                status: action === "approve" ? "approved" : "rejected",
                resolved_at: new Date().toISOString(),
            })
            .eq("id", id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, id, status: action === "approve" ? "approved" : "rejected" });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
