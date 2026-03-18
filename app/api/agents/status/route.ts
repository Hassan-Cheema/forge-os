import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/agents/status?userId=...&ids=id1,id2,...
export async function GET(req: NextRequest) {
    const userId = req.nextUrl.searchParams.get("userId");
    const ids = req.nextUrl.searchParams.get("ids");

    if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = (supabase.from("agents") as any)
        .select("id, name, goal, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

    if (ids) {
        const idList = ids.split(",").filter(Boolean);
        if (idList.length > 0) {
            query = query.in("id", idList);
        }
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agents: data ?? [] });
}
