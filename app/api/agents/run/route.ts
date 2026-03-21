import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAgentSpawner, getAllTools } from "@/lib/agents/agent-spawner";
import { createBaseAgent } from "@/lib/agents/base-agent";

// Allow up to 5 minutes on Vercel Pro; Hobby will cap at 60s
export const maxDuration = 300;

export type StreamEvent =
  | { type: "plan"; data: { plan: string; totalAgents: number; agents: AgentMeta[] } }
  | { type: "agent_start"; data: { id: string } }
  | { type: "agent_done"; data: { id: string; result: AgentResult } }
  | { type: "agent_error"; data: { id: string; message: string } }
  | { type: "synthesis_start"; data: Record<string, never> }
  | { type: "synthesis_chunk"; data: { text: string } }
  | { type: "synthesis_done"; data: Record<string, never> }
  | { type: "complete"; data: Record<string, never> }
  | { type: "error"; data: { message: string } };

export interface AgentMeta {
  id: string;
  name: string;
  goal: string;
  emoji: string;
}

export interface AgentArtifact {
  type: string;
  title: string;
  content: string;
}

export interface AgentResult {
  success: boolean;
  stepsExecuted: number;
  actionsBlocked: number;
  actionsQueued: number;
  summary: string;
  artifacts: AgentArtifact[];
}

interface CompletedAgent {
  name: string;
  emoji: string;
  result: AgentResult;
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
  const materialText: string = body.materialText?.trim() ?? "";

  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

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

        const spawnResult = await spawner.spawn(prompt, materialText || undefined);

        // ── Material Analyzer agent (injected when file is uploaded) ──────────
        if (materialText) {
          const materialId = crypto.randomUUID();
          const materialInstance = createBaseAgent({
            id: materialId,
            userId: user.id,
            name: "Material Analyzer",
            goal: "Analyze the provided research materials in full detail. Extract: (1) main thesis and arguments, (2) all key data, statistics, and evidence, (3) methodology, (4) conclusions and recommendations, (5) important references and sources. Produce a thorough structured summary.",
            tools: getAllTools().filter((t) => t.name === "save_note"),
            systemPrompt: `UPLOADED RESEARCH MATERIALS:\n\n${materialText}\n\n---\nAnalyze the above materials thoroughly. Your entire analysis must be grounded in this document. Do not use web search — the material is fully provided above.`,
            model: "claude-sonnet-4-6",
            maxSteps: 4,
            userRiskLimit: 6,
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
            supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
          });
          spawnResult.agents.unshift({
            id: materialId,
            name: "Material Analyzer",
            goal: "Analyze uploaded research materials",
            emoji: "📚",
            status: "ready",
            instance: materialInstance,
          });
          spawnResult.totalAgents = spawnResult.agents.length;
        }

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

        // Run all agents in parallel, track each result
        const completedAgents: CompletedAgent[] = [];

        await Promise.allSettled(
          spawnResult.agents.map(async (agent) => {
            send({ type: "agent_start", data: { id: agent.id } });
            try {
              const result = await agent.instance.run();
              completedAgents.push({ name: agent.name, emoji: agent.emoji, result });
              send({ type: "agent_done", data: { id: agent.id, result } });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              send({ type: "agent_error", data: { id: agent.id, message } });
            }
          })
        );

        // ── Synthesis step ────────────────────────────────────────────────
        // All agents are done. Ask Claude to merge every output into ONE
        // clean, complete final answer for the user.
        if (completedAgents.length > 0) {
          send({ type: "synthesis_start", data: {} });

          // Build a compact context from all agent outputs (cap each to avoid
          // hitting token limits).
          // Put Material Analyzer first so synthesis can use it as the foundation
          const sorted = [
            ...completedAgents.filter((a) => a.name === "Material Analyzer"),
            ...completedAgents.filter((a) => a.name !== "Material Analyzer"),
          ];
          const agentContext = sorted
            .map(({ name, emoji, result }) => {
              const lines: string[] = [`## ${emoji} ${name}`, result.summary.slice(0, 5000)];
              for (const art of result.artifacts) {
                lines.push(`### ${art.title}\n${art.content.slice(0, 6000)}`);
              }
              return lines.join("\n\n");
            })
            .join("\n\n---\n\n");

          const synthesisStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system:
              "You are an expert research synthesizer. Merge all agent findings into a comprehensive, authoritative report. Rules: (1) Write substantive content with specific facts, statistics, and examples from the research. (2) Use clean markdown: ## headings, bullet points, **bold** key terms, numbered lists where appropriate. (3) Start with a brief executive summary. (4) Remove ALL agent meta-commentary — present the actual findings as your own analysis. (5) Be thorough and detailed; aim for at least 800 words of substantive content.",
            messages: [
              {
                role: "user",
                content: `User's original request: "${prompt}"

Agent research findings:

${agentContext}

Write the complete, comprehensive final answer now. Present all findings in full — do not summarise or truncate.`,
              },
            ],
          });

          let synthesisText = "";
          for await (const chunk of synthesisStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              synthesisText += chunk.delta.text;
              send({ type: "synthesis_chunk", data: { text: chunk.delta.text } });
            }
          }

          send({ type: "synthesis_done", data: {} });

          // Persist report with type = "research"
          if (synthesisText) {
            const serviceClient = createServiceClient();
            await serviceClient.from("reports").insert({
              user_id: user.id,
              prompt,
              content: synthesisText,
              type: "research",
            });
          }
        }

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
      "X-Accel-Buffering": "no",
    },
  });
}
