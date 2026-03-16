import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  ActionCategory,
  AgentAction,
  RiskLimiter,
  createRiskLimiter,
} from "@/lib/risk-limiter";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "paused" | "error";

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  /** Maps to ActionCategory for risk scoring */
  category: ActionCategory;
  /** Plain-English explanation of what makes this tool risky */
  riskDescription: string;
  /** Runs the tool and returns a string result to feed back to Claude */
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface BaseAgentConfig {
  id: string;
  userId: string;
  name: string;
  /** The single objective Claude will try to fulfil */
  goal: string;
  tools: AgentTool[];
  /** 1–10. Actions scored above this are queued for human approval. */
  userRiskLimit: number;
  /** Hard cap on agentic loop iterations */
  maxSteps?: number;
  /** Extra instructions prepended to the system prompt */
  systemPrompt?: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  anthropicApiKey: string;
}

export interface AgentRunResult {
  success: boolean;
  stepsExecuted: number;
  actionsBlocked: number;
  actionsQueued: number;
  summary: string;
}

// ─── BaseAgent ────────────────────────────────────────────────────────────────

export class BaseAgent {
  private config: BaseAgentConfig;
  private anthropic: Anthropic;
  private supabase: SupabaseClient;
  private limiter: RiskLimiter;
  private status: AgentStatus = "idle";

  constructor(config: BaseAgentConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
    this.limiter = createRiskLimiter({
      userId: config.userId,
      userRiskLimit: config.userRiskLimit,
      supabaseUrl: config.supabaseUrl,
      supabaseServiceKey: config.supabaseServiceKey,
      anthropicApiKey: config.anthropicApiKey,
    });
  }

  /**
   * Main agentic loop.
   * Calls Claude → handles tool use → feeds results back → repeats until done.
   */
  async run(): Promise<AgentRunResult> {
    await this.setStatus("running");
    this.log("Starting");

    const maxSteps = this.config.maxSteps ?? 20;
    let steps = 0;
    let actionsBlocked = 0;
    let actionsQueued = 0;

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: this.config.goal },
    ];

    try {
      while (steps < maxSteps) {
        steps++;
        this.log(`Step ${steps}/${maxSteps}`);

        const response = await this.anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: this.buildSystemPrompt(),
          tools: this.buildClaudeTools(),
          messages,
        });

        // Append assistant turn
        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "end_turn") {
          this.log("Done — end_turn");
          break;
        }

        if (response.stop_reason === "tool_use") {
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of response.content) {
            if (block.type !== "tool_use") continue;

            const { blocked, queued, result } = await this.handleToolCall(block);
            if (blocked) actionsBlocked++;
            if (queued) actionsQueued++;

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }

          messages.push({ role: "user", content: toolResults });
          continue;
        }

        // max_tokens or other stop reasons — stop gracefully
        this.log(`Stopping — stop_reason: ${response.stop_reason}`);
        break;
      }

      if (steps >= maxSteps) {
        this.log("Max steps reached");
      }

      // Extract plain-text summary from last assistant message
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === "assistant");
      const summary =
        typeof lastAssistant?.content === "string"
          ? lastAssistant.content
          : lastAssistant?.content
              ?.filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text)
              .join("\n") ?? "Agent completed.";

      await this.setStatus("idle");
      return { success: true, stepsExecuted: steps, actionsBlocked, actionsQueued, summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`Error: ${message}`);
      await this.setStatus("error");
      return {
        success: false,
        stepsExecuted: steps,
        actionsBlocked,
        actionsQueued,
        summary: `Agent failed: ${message}`,
      };
    }
  }

  /**
   * Runs the risk check on a tool call BEFORE executing it.
   * Returns the string result to feed back to Claude in all three cases.
   */
  private async handleToolCall(toolUse: Anthropic.ToolUseBlock): Promise<{
    blocked: boolean;
    queued: boolean;
    result: string;
  }> {
    const tool = this.config.tools.find((t) => t.name === toolUse.name);

    if (!tool) {
      return {
        blocked: true,
        queued: false,
        result: `Error: tool "${toolUse.name}" is not registered for this agent.`,
      };
    }

    const input = toolUse.input as Record<string, unknown>;

    const action: AgentAction = {
      toolName: tool.name,
      category: tool.category,
      description: `${tool.description} — ${tool.riskDescription}`,
      input,
      agentId: this.config.id,
      userId: this.config.userId,
    };

    const decision = await this.limiter.evaluate(action);
    this.log(`${tool.name} → risk ${decision.score}/10 → ${decision.decision}`);

    if (decision.decision === "block") {
      return {
        blocked: true,
        queued: false,
        result: `Action blocked (risk score ${decision.score}/10): ${decision.reason}`,
      };
    }

    if (decision.decision === "queue") {
      return {
        blocked: false,
        queued: true,
        result: `Action queued for human approval (risk score ${decision.score}/10): ${decision.reason}. You may continue with other tasks.`,
      };
    }

    // execute
    try {
      const result = await tool.execute(input);
      return { blocked: false, queued: false, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        blocked: false,
        queued: false,
        result: `Tool execution failed: ${message}`,
      };
    }
  }

  /** Converts AgentTool[] to the format the Anthropic SDK expects. */
  private buildClaudeTools(): Anthropic.Tool[] {
    return this.config.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  private buildSystemPrompt(): string {
    const base = `You are ${this.config.name}, an autonomous AI agent.

Your goal: ${this.config.goal}

Rules:
- Use the tools available to you to complete the goal.
- If a tool call is blocked or queued, acknowledge it and continue with what you can do.
- Be concise in tool inputs — do not pass more data than needed.
- When the goal is complete, summarise what you accomplished in plain text.`;

    return this.config.systemPrompt ? `${this.config.systemPrompt}\n\n${base}` : base;
  }

  /** Updates the agent's status row in Supabase. */
  private async setStatus(status: AgentStatus): Promise<void> {
    this.status = status;
    const { error } = await this.supabase
      .from("agents")
      .upsert({
        id: this.config.id,
        user_id: this.config.userId,
        name: this.config.name,
        status,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error(`[${this.config.name}] Failed to update status:`, error.message);
    }
  }

  log(message: string): void {
    console.log(`[${this.config.name}] ${message}`);
  }

  getStatus(): AgentStatus {
    return this.status;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBaseAgent(config: BaseAgentConfig): BaseAgent {
  return new BaseAgent(config);
}
