import Anthropic from "@anthropic-ai/sdk";
import { AgentTool } from "@/lib/agents/base-agent";
import { BaseAgent, createBaseAgent, AgentRunResult } from "@/lib/agents/base-agent";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpawnedAgent {
  id: string;
  name: string;
  goal: string;
  emoji: string;
  /** Populated after spawn(), before run() */
  status: "ready" | "running" | "done" | "failed";
  instance: BaseAgent;
}

export interface SpawnResult {
  agents: SpawnedAgent[];
  /** Claude's plain-English plan for how the agents divide the work */
  plan: string;
  totalAgents: number;
}

interface AgentPlan {
  name: string;
  goal: string;
  emoji: string;
  toolNames: string[];
}

interface DecomposedPlan {
  plan: string;
  agents: AgentPlan[];
}

// ─── Shared tool registry ─────────────────────────────────────────────────────

/**
 * All tools available to agents. Each spawned agent receives a subset
 * based on what Claude selects during decomposition.
 */
export function getAllTools(): AgentTool[] {
  return [
    {
      name: "search_web",
      description: "Search DuckDuckGo and return relevant results for a query.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
      },
      category: "read",
      riskDescription: "Read-only web search, no side effects.",
      async execute(input) {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
          input.query as string
        )}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
        const res = await fetch(url, { headers: { "User-Agent": "forge-os/1.0" } });
        if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
        const data = await res.json();
        return JSON.stringify({
          abstract: data.Abstract || null,
          answer: data.Answer || null,
          relatedTopics: (data.RelatedTopics || [])
            .filter((t: { Text?: string; FirstURL?: string }) => t.Text && t.FirstURL)
            .slice(0, 8)
            .map((t: { Text: string; FirstURL: string }) => ({ text: t.Text, url: t.FirstURL })),
        });
      },
    },
    {
      name: "fetch_page",
      description: "Fetch the text content of a public web page.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Fully-qualified URL to fetch." },
        },
        required: ["url"],
      },
      category: "read",
      riskDescription: "Read-only HTTP GET, no side effects.",
      async execute(input) {
        const res = await fetch(input.url as string);
        if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
        const html = await res.text();
        // Strip tags for brevity
        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return text.slice(0, 4000);
      },
    },
    {
      name: "save_note",
      description: "Save a text note to the agent's memory store.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title for the note." },
          content: { type: "string", description: "Body of the note." },
        },
        required: ["title", "content"],
      },
      category: "write",
      riskDescription: "Writes to internal storage only, no external side effects.",
      async execute(input) {
        // In production: persist to Supabase notes table
        console.log(`[save_note] ${input.title}`);
        return `Note "${input.title}" saved successfully.`;
      },
    },
    {
      name: "create_file",
      description: "Create a text file with the given name and content.",
      input_schema: {
        type: "object",
        properties: {
          filename: { type: "string", description: "File name including extension." },
          content: { type: "string", description: "Full file content." },
        },
        required: ["filename", "content"],
      },
      category: "write",
      riskDescription: "Creates a new file; does not overwrite or delete existing files.",
      async execute(input) {
        // In production: write to storage bucket or filesystem sandbox
        console.log(`[create_file] ${input.filename} (${(input.content as string).length} chars)`);
        return `File "${input.filename}" created successfully.`;
      },
    },
    {
      name: "draft_email",
      description: "Compose an email draft (does not send — queued for human review).",
      input_schema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address." },
          subject: { type: "string", description: "Email subject line." },
          body: { type: "string", description: "Email body in plain text." },
        },
        required: ["to", "subject", "body"],
      },
      category: "send",
      riskDescription: "Creates a draft; does not transmit without human approval.",
      async execute(input) {
        console.log(`[draft_email] To: ${input.to} | Subject: ${input.subject}`);
        return `Email draft created. To: ${input.to}, Subject: "${input.subject}". Awaiting send approval.`;
      },
    },
    {
      name: "draft_social_post",
      description: "Compose a social media post draft (does not publish).",
      input_schema: {
        type: "object",
        properties: {
          platform: { type: "string", description: "Target platform, e.g. Twitter, LinkedIn." },
          content: { type: "string", description: "Post text content." },
        },
        required: ["platform", "content"],
      },
      category: "send",
      riskDescription: "Creates a draft only; publish requires explicit human action.",
      async execute(input) {
        console.log(`[draft_social_post] ${input.platform}: ${(input.content as string).slice(0, 60)}…`);
        return `${input.platform} post drafted. Awaiting publish approval.`;
      },
    },
    {
      name: "run_code",
      description: "Execute a snippet of JavaScript or Python code in a sandbox.",
      input_schema: {
        type: "object",
        properties: {
          language: { type: "string", description: '"javascript" or "python".' },
          code: { type: "string", description: "Code to execute." },
        },
        required: ["language", "code"],
      },
      category: "execute",
      riskDescription: "Runs arbitrary code; sandboxed but can produce side effects.",
      async execute(input) {
        // In production: call a sandboxed code execution service
        console.log(`[run_code] ${input.language}: ${(input.code as string).slice(0, 80)}`);
        return `Code executed (sandbox). Language: ${input.language}. Output: [simulated result]`;
      },
    },
    {
      name: "call_api",
      description: "Make an authenticated HTTP request to an external API.",
      input_schema: {
        type: "object",
        properties: {
          method: { type: "string", description: "HTTP method: GET, POST, PUT, DELETE." },
          url: { type: "string", description: "Full API endpoint URL." },
          body: { type: "string", description: "JSON request body (optional)." },
        },
        required: ["method", "url"],
      },
      category: "api_call",
      riskDescription: "External network call; impact depends on the endpoint and method.",
      async execute(input) {
        const res = await fetch(input.url as string, {
          method: input.method as string,
          headers: { "Content-Type": "application/json" },
          body: input.body ? String(input.body) : undefined,
        });
        const text = await res.text();
        return `${res.status} ${res.statusText}: ${text.slice(0, 1000)}`;
      },
    },
  ];
}

// ─── AgentSpawner ─────────────────────────────────────────────────────────────

export class AgentSpawner {
  private userId: string;
  private anthropic: Anthropic;
  private supabaseUrl: string;
  private supabaseServiceKey: string;
  private anthropicApiKey: string;
  private userRiskLimit: number;

  constructor(config: {
    userId: string;
    supabaseUrl: string;
    supabaseServiceKey: string;
    anthropicApiKey: string;
    /** Passed through to every spawned agent. Default: 6 */
    userRiskLimit?: number;
  }) {
    this.userId = config.userId;
    this.supabaseUrl = config.supabaseUrl;
    this.supabaseServiceKey = config.supabaseServiceKey;
    this.anthropicApiKey = config.anthropicApiKey;
    this.userRiskLimit = config.userRiskLimit ?? 6;
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  /**
   * Decomposes a user prompt into 2–5 agents and creates their BaseAgent instances.
   * Does NOT run them — call runAll() for that.
   */
  async spawn(userPrompt: string): Promise<SpawnResult> {
    const decomposed = await this.decompose(userPrompt);

    const agents: SpawnedAgent[] = decomposed.agents.map((plan) => {
      const id = crypto.randomUUID();
      const tools = this.selectTools(plan.toolNames);

      const instance = createBaseAgent({
        id,
        userId: this.userId,
        name: plan.name,
        goal: plan.goal,
        tools,
        userRiskLimit: this.userRiskLimit,
        maxSteps: 15,
        supabaseUrl: this.supabaseUrl,
        supabaseServiceKey: this.supabaseServiceKey,
        anthropicApiKey: this.anthropicApiKey,
      });

      return {
        id,
        name: plan.name,
        goal: plan.goal,
        emoji: plan.emoji,
        status: "ready" as const,
        instance,
      };
    });

    return {
      agents,
      plan: decomposed.plan,
      totalAgents: agents.length,
    };
  }

  /**
   * Runs all agents in parallel using Promise.allSettled.
   * Returns one AgentRunResult per agent in the same order.
   */
  async runAll(
    spawnResult: SpawnResult
  ): Promise<Array<{ agent: SpawnedAgent; result: AgentRunResult }>> {
    const runs = spawnResult.agents.map(async (agent) => {
      agent.status = "running";
      try {
        const result = await agent.instance.run();
        agent.status = result.success ? "done" : "failed";
        return { agent, result };
      } catch (err) {
        agent.status = "failed";
        const message = err instanceof Error ? err.message : String(err);
        return {
          agent,
          result: {
            success: false,
            stepsExecuted: 0,
            actionsBlocked: 0,
            actionsQueued: 0,
            summary: `Agent threw an unhandled error: ${message}`,
          },
        };
      }
    });

    return Promise.all(runs);
  }

  /**
   * Asks Claude to decompose the user prompt into a team of 2–5 specialist agents.
   * Uses tool_choice to guarantee structured JSON output.
   */
  private async decompose(userPrompt: string): Promise<DecomposedPlan> {
    const availableTools = getAllTools()
      .map((t) => `${t.name} (${t.category}) — ${t.description}`)
      .join("\n");

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools: [
        {
          name: "create_agent_team",
          description: "Define the team of agents that will handle the user request.",
          input_schema: {
            type: "object" as const,
            properties: {
              plan: {
                type: "string",
                description:
                  "One-paragraph explanation of how the agents divide the work.",
              },
              agents: {
                type: "array",
                description: "2–5 agents. Each agent has a single clear objective.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Short agent name, e.g. 'Research Agent'." },
                    goal: { type: "string", description: "The specific objective for this agent." },
                    emoji: { type: "string", description: "A single emoji representing this agent." },
                    toolNames: {
                      type: "array",
                      items: { type: "string" },
                      description: "Names of tools this agent needs (from the available list).",
                    },
                  },
                  required: ["name", "goal", "emoji", "toolNames"],
                },
              },
            },
            required: ["plan", "agents"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "create_agent_team" },
      messages: [
        {
          role: "user",
          content: `You are an AI orchestrator. Decompose the following user request into a team of 2–5 specialist agents that will work in parallel.

Each agent should have:
- A single, focused objective (not a copy of the full task)
- Only the tools it actually needs
- A distinct role that does not duplicate another agent's work

Available tools:
${availableTools}

User request: ${userPrompt}`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AgentSpawner: Claude did not return a valid agent plan.");
    }

    return toolUse.input as DecomposedPlan;
  }

  /** Returns the subset of getAllTools() matching the given names. Unknown names are ignored. */
  selectTools(toolNames: string[]): AgentTool[] {
    const all = getAllTools();
    return toolNames
      .map((name) => all.find((t) => t.name === name))
      .filter((t): t is AgentTool => t !== undefined);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAgentSpawner(config: {
  userId: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  anthropicApiKey: string;
  userRiskLimit?: number;
}): AgentSpawner {
  return new AgentSpawner(config);
}
