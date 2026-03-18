import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { BaseAgent, type AgentTool } from "./base-agent";
import type { AgentAction } from "../risk-limiter";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SpawnedAgent {
    id: string;
    name: string;
    goal: string;
    emoji: string;       // for the visual canvas node
    status: "idle" | "running" | "paused" | "error";
    instance: BaseAgent;
}

export interface SpawnResult {
    agents: SpawnedAgent[];
    plan: string;        // human-readable plan Claude made
    totalAgents: number;
}

// ─────────────────────────────────────────────
// All available tools FORGE OS agents can use
// ─────────────────────────────────────────────

function getAllTools(): AgentTool[] {
    return [
        // ── Read tools (risk 1-2) ──
        {
            name: "search_web",
            description: "Search the web for current information on any topic",
            category: "read",
            riskDescription: "Read-only web search",
            input_schema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query" },
                },
                required: ["query"],
            },
            execute: async (input) => {
                const query = input.query as string;
                try {
                    const res = await fetch(
                        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
                        {
                            headers: {
                                "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!,
                            },
                        }
                    );
                    const data = await res.json();
                    const results = data.web?.results ?? [];
                    return results
                        .map((r: { title: string; url: string; description: string }) =>
                            `${r.title}\n${r.url}\n${r.description}`
                        )
                        .join("\n\n") || "No results found.";
                } catch {
                    return "Search unavailable — continuing without web results.";
                }
            },
        },

        {
            name: "fetch_page",
            description: "Read the content of any webpage URL",
            category: "read",
            riskDescription: "Read-only page fetch",
            input_schema: {
                type: "object",
                properties: {
                    url: { type: "string", description: "Full URL to fetch" },
                },
                required: ["url"],
            },
            execute: async (input) => {
                try {
                    const res = await fetch(input.url as string, {
                        headers: { "User-Agent": "FORGE-OS/1.0" },
                        signal: AbortSignal.timeout(8000),
                    });
                    const html = await res.text();
                    return html
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                        .replace(/<[^>]+>/g, " ")
                        .replace(/\s+/g, " ")
                        .trim()
                        .slice(0, 3000);
                } catch {
                    return "Could not fetch page.";
                }
            },
        },

        // ── Write tools (risk 3-4) ──
        {
            name: "save_note",
            description: "Save any text, summary, or document to the user's workspace",
            category: "write",
            riskDescription: "Saves text to user's own workspace only",
            input_schema: {
                type: "object",
                properties: {
                    title: { type: "string", description: "Document title" },
                    content: { type: "string", description: "Document content" },
                    type: {
                        type: "string",
                        enum: ["research", "copy", "plan", "code", "outreach"],
                        description: "Type of document",
                    },
                },
                required: ["title", "content", "type"],
            },
            execute: async (input) => {
                // In production: write to Supabase documents table
                // For now: simulate success
                console.log(`[save_note] Saving: ${input.title}`);
                return `Saved "${input.title}" to workspace.`;
            },
        },

        {
            name: "create_file",
            description: "Create a file with content (code, markdown, text)",
            category: "write",
            riskDescription: "Creates new file in user's sandbox only",
            input_schema: {
                type: "object",
                properties: {
                    filename: { type: "string", description: "File name with extension" },
                    content: { type: "string", description: "File content" },
                },
                required: ["filename", "content"],
            },
            execute: async (input) => {
                console.log(`[create_file] Creating: ${input.filename}`);
                return `File created: ${input.filename} (${(input.content as string).length} chars)`;
            },
        },

        // ── Send tools (risk 5-6, needs approval) ──
        {
            name: "draft_email",
            description: "Draft an email to send (requires approval before sending)",
            category: "send",
            riskDescription: "Drafts email for user approval before any sending",
            input_schema: {
                type: "object",
                properties: {
                    to: { type: "string", description: "Recipient email" },
                    subject: { type: "string", description: "Email subject" },
                    body: { type: "string", description: "Email body" },
                },
                required: ["to", "subject", "body"],
            },
            execute: async (input) => {
                // Risk limiter will queue this for approval (risk 5)
                return `Email drafted to ${input.to}: "${input.subject}"`;
            },
        },

        {
            name: "draft_social_post",
            description: "Draft a social media post for Twitter/X or LinkedIn",
            category: "send",
            riskDescription: "Drafts post for user review before publishing",
            input_schema: {
                type: "object",
                properties: {
                    platform: {
                        type: "string",
                        enum: ["twitter", "linkedin"],
                        description: "Social platform",
                    },
                    content: { type: "string", description: "Post content" },
                },
                required: ["platform", "content"],
            },
            execute: async (input) => {
                return `${input.platform} post drafted: "${(input.content as string).slice(0, 100)}..."`;
            },
        },

        // ── Execute tools (risk 6-7, needs approval) ──
        {
            name: "run_code",
            description: "Execute a JavaScript or Python code snippet",
            category: "execute",
            riskDescription: "Runs code in isolated sandbox environment",
            input_schema: {
                type: "object",
                properties: {
                    language: {
                        type: "string",
                        enum: ["javascript", "python"],
                    },
                    code: { type: "string", description: "Code to execute" },
                },
                required: ["language", "code"],
            },
            execute: async (input) => {
                // Risk limiter will require approval (risk 6)
                // In production: run in Docker sandbox
                return `Code execution queued for approval: ${(input.code as string).slice(0, 100)}`;
            },
        },

        // ── API tools (risk 2-3) ──
        {
            name: "call_api",
            description: "Make an HTTP GET request to any public API",
            category: "api_call",
            riskDescription: "Read-only GET request to external API",
            input_schema: {
                type: "object",
                properties: {
                    url: { type: "string", description: "API endpoint URL" },
                    headers: {
                        type: "object",
                        description: "Optional request headers",
                    },
                },
                required: ["url"],
            },
            execute: async (input) => {
                try {
                    const res = await fetch(input.url as string, {
                        method: "GET",
                        headers: (input.headers as Record<string, string>) ?? {},
                        signal: AbortSignal.timeout(8000),
                    });
                    const data = await res.text();
                    return data.slice(0, 2000);
                } catch {
                    return "API call failed.";
                }
            },
        },
    ];
}

// ─────────────────────────────────────────────
// AgentSpawner — creates agents from one prompt
// ─────────────────────────────────────────────

export class AgentSpawner {
    private anthropic: Anthropic;
    private supabase: ReturnType<typeof createClient>;
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
        });
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }

    async spawn(userPrompt: string): Promise<SpawnResult> {
        // Step 1: Ask Claude to decompose the prompt into a team of agents
        const plan = await this.decompose(userPrompt);

        // Step 2: Instantiate each agent with the right tools
        const agents: SpawnedAgent[] = plan.agents.map((agentPlan) => {
            const tools = this.selectTools(agentPlan.toolNames);
            const id = crypto.randomUUID();

            const instance = new BaseAgent({
                id,
                userId: this.userId,
                name: agentPlan.name,
                goal: agentPlan.goal,
                tools,
                userRiskLimit: 6,
                maxSteps: 15,
            });

            return {
                id,
                name: agentPlan.name,
                goal: agentPlan.goal,
                emoji: agentPlan.emoji,
                status: "idle",
                instance,
            };
        });

        // Step 3: Persist agents to Supabase so status updates work
        await this.persistAgents(agents, userPrompt);

        return {
            agents,
            plan: plan.summary,
            totalAgents: agents.length,
        };
    }

    private async persistAgents(agents: SpawnedAgent[], prompt: string): Promise<void> {
        const rows = agents.map((a) => ({
            id: a.id,
            user_id: this.userId,
            name: a.name,
            goal: a.goal,
            status: "idle",
            schedule: null,
            created_at: new Date().toISOString(),
        }));
        await (this.supabase.from("agents") as any).insert(rows);
    }

    // ── Run all agents in parallel ───────────────

    async runAll(spawnResult: SpawnResult): Promise<void> {
        console.log(`Running ${spawnResult.totalAgents} agents in parallel...`);

        await Promise.allSettled(
            spawnResult.agents.map((agent) => agent.instance.run())
        );
    }

    // ── Claude decomposes prompt into agent plans ─

    private async decompose(userPrompt: string): Promise<{
        summary: string;
        agents: Array<{
            name: string;
            goal: string;
            emoji: string;
            toolNames: string[];
        }>;
    }> {
        const availableTools = getAllTools().map((t) => t.name).join(", ");

        const response = await this.anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [
                {
                    role: "user",
                    content: `You are the orchestrator for FORGE OS — an autonomous AI agent platform.

A user has entered this goal: "${userPrompt}"

Your job: decompose this into 2–5 specialized AI agents that can work in parallel to achieve the goal.

Available tools each agent can use: ${availableTools}

Rules:
- Create 2–5 agents maximum (not more)
- Each agent should have a clear, specific goal
- Assign only the tools each agent actually needs
- Agents work in parallel, so make goals independent where possible
- Be practical — focus on what can actually be done with the available tools

Respond ONLY with valid JSON, no markdown:
{
  "summary": "one paragraph describing the overall plan",
  "agents": [
    {
      "name": "Agent Name",
      "goal": "Specific goal this agent will accomplish",
      "emoji": "single emoji representing this agent",
      "toolNames": ["tool1", "tool2"]
    }
  ]
}`,
                },
            ],
        });

        const text =
            response.content[0].type === "text" ? response.content[0].text : "{}";

        try {
            return JSON.parse(text.trim());
        } catch {
            // Fallback: single research agent
            return {
                summary: `Working on: ${userPrompt}`,
                agents: [
                    {
                        name: "Research Agent",
                        goal: userPrompt,
                        emoji: "🔍",
                        toolNames: ["search_web", "fetch_page", "save_note"],
                    },
                ],
            };
        }
    }

    // ── Select tools by name ─────────────────────

    private selectTools(toolNames: string[]): AgentTool[] {
        const all = getAllTools();
        return all.filter((t) => toolNames.includes(t.name));
    }
}

// ─────────────────────────────────────────────
// Factory helper
// ─────────────────────────────────────────────

export function createAgentSpawner(userId: string): AgentSpawner {
    return new AgentSpawner(userId);
}
