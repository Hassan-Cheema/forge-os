import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAgentSpawner } from "@/lib/agents/agent-spawner";

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

        // ── LaTeX synthesis step ──────────────────────────────────────────
        // All agents are done. Ask Claude to write a complete .tex paper
        // from everything the agents produced.
        if (completedAgents.length > 0) {
          send({ type: "synthesis_start", data: {} });

          const agentContext = completedAgents
            .map(({ name, emoji, result }) => {
              const lines: string[] = [`## ${emoji} ${name}`, result.summary.slice(0, 2500)];
              for (const art of result.artifacts) {
                lines.push(`### ${art.title}\n${art.content.slice(0, 3000)}`);
              }
              return lines.join("\n\n");
            })
            .join("\n\n---\n\n");

          const synthesisStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: `You are an academic LaTeX paper generator. Produce a complete, error-free LaTeX document from the research provided.

MANDATORY RULES — violating any rule will break the document:

1. Output ONLY raw LaTeX. Zero markdown, zero code fences, zero commentary before or after.
2. First line must be \\documentclass[12pt,a4paper]{article} — nothing before it.
3. Use ONLY these three packages (no others):
   \\usepackage[margin=1in]{geometry}
   \\usepackage{amsmath}
   \\usepackage[utf8]{inputenc}
4. Author: "Anonymous". Date: write the literal current month and year, e.g. \\date{March 2026} — NEVER use \\today.
5. Document body structure (in this exact order):
   \\begin{document}
   \\maketitle
   \\begin{abstract} ... \\end{abstract}
   (at least 4 \\section{Title} blocks with substantial prose)
   \\begin{thebibliography}{99} ... \\end{thebibliography}
   \\end{document}
6. Citations: write them as inline text like (Author, Year) — do NOT use \\cite{} commands.
7. Bibliography: use \\bibitem{refN} entries inside \\begin{thebibliography}{99}.
8. FORBIDDEN commands — never use any of these:
   \\cite, \\ref, \\label, \\footnote, \\includegraphics,
   \\usepackage{booktabs}, \\usepackage{natbib}, \\usepackage{hyperref},
   \\usepackage{graphicx}, tabular, table, figure environments.
9. Special characters in plain text — always escape:
   & → \\&    % → \\%    # → \\#    _ → \\_    ^ → \\^{}
   Never use bare & % # _ ^ in text paragraphs.
10. Every \\begin{X} must have exactly one \\end{X}. Final line: \\end{document}.`,
            messages: [
              {
                role: "user",
                content: `Research request: "${prompt}"

Agent findings:

${agentContext}

Write the complete LaTeX paper now. First line must be \\documentclass — nothing before it.`,
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

          // Persist report with type = "latex"
          if (synthesisText) {
            const serviceClient = createServiceClient();
            await serviceClient.from("reports").insert({
              user_id: user.id,
              prompt,
              content: synthesisText,
              type: "latex",
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
