import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAgentSpawner } from "@/lib/agents/agent-spawner";

// Allow up to 5 minutes on Vercel Pro; Hobby will cap at 60s
export const maxDuration = 300;

export type StreamEvent =
  | { type: "plan"; data: { plan: string; totalAgents: number; agents: AgentMeta[] } }
  | { type: "agent_start"; data: { id: string } }
  | { type: "agent_done"; data: { id: string; result: AgentResult } }
  | { type: "agent_error"; data: { id: string; message: string } }
  | { type: "complete"; data: Record<string, never> }
  | { type: "error"; data: { message: string } };

export interface AgentMeta {
  id: string;
  name: string;
  goal: string;
  emoji: string;
}

export interface AgentResult {
  success: boolean;
  stepsExecuted: number;
  actionsBlocked: number;
  actionsQueued: number;
  summary: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const prompt: string = body.prompt?.trim() ?? "";

  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: StreamEvent) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      try {
        const spawner = createAgentSpawner({
          userId: user.id,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
          userRiskLimit: 6,
        });

        const spawnResult = await spawner.spawn(prompt);

        send({
          type: "plan",
          data: {
            plan: spawnResult.plan,
            totalAgents: spawnResult.totalAgents,
            agents: spawnResult.agents.map((a) => ({
              id: a.id,
              name: a.name,
              goal: a.goal,
              emoji: a.emoji,
            })),
          },
        });

        // Run agents in parallel, emit an event as each one finishes
        await Promise.allSettled(
          spawnResult.agents.map(async (agent) => {
            send({ type: "agent_start", data: { id: agent.id } });
            try {
              const result = await agent.instance.run();
              send({ type: "agent_done", data: { id: agent.id, result } });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              send({ type: "agent_error", data: { id: agent.id, message } });
            }
          })
        );

        send({ type: "complete", data: {} });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", data: { message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
