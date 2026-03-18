import { NextRequest, NextResponse } from "next/server";
import { createAgentSpawner } from "@/lib/agents/agent-spawner";

export async function POST(req: NextRequest) {
    try {
        const { prompt, userId } = await req.json();

        if (!prompt || !userId) {
            return NextResponse.json(
                { error: "prompt and userId are required" },
                { status: 400 }
            );
        }

        const spawner = createAgentSpawner(userId);

        // Step 1: decompose prompt into agents
        const result = await spawner.spawn(prompt);

        // Step 2: run all agents in parallel (non-blocking)
        spawner.runAll(result).catch(console.error);

        // Step 3: return agent plan immediately so UI can show the canvas
        return NextResponse.json({
            success: true,
            plan: result.plan,
            totalAgents: result.totalAgents,
            agents: result.agents.map((a) => ({
                id: a.id,
                name: a.name,
                goal: a.goal,
                emoji: a.emoji,
                status: a.status,
            })),
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
