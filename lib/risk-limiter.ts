import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Integer 1–10. 1 = harmless, 10 = catastrophic. */
export type RiskLevel = number;

export type ActionCategory =
  | "read"
  | "write"
  | "send"
  | "execute"
  | "delete"
  | "deploy"
  | "purchase"
  | "auth"
  | "api_call"
  | "system";

export interface AgentAction {
  /** Tool name being called, e.g. "filesystem.delete_all" */
  toolName: string;
  /** High-level category for floor scoring */
  category: ActionCategory;
  /** Human-readable description of what this action will do */
  description: string;
  /** The raw input being passed to the tool */
  input: Record<string, unknown>;
  /** Which agent is requesting this */
  agentId: string;
  /** End user who owns this agent */
  userId: string;
}

export type DecisionOutcome = "execute" | "queue" | "block";

export interface RiskDecision {
  decision: DecisionOutcome;
  score: RiskLevel;
  reason: string;
}

// ─── Category floors ──────────────────────────────────────────────────────────

/**
 * Minimum risk score per category, regardless of what Claude scores.
 * Prevents Claude from under-scoring inherently dangerous categories.
 */
export const CATEGORY_FLOOR: Record<ActionCategory, RiskLevel> = {
  read: 1,
  write: 3,
  send: 5,
  execute: 6,
  delete: 7,
  deploy: 7,
  purchase: 9,
  auth: 4,
  api_call: 2,
  system: 8,
};

// ─── Always-blocked tools ─────────────────────────────────────────────────────

/**
 * Tools that are permanently blocked — no user risk limit can unlock them.
 * "queue" is not offered; they are refused outright.
 */
export const ALWAYS_BLOCK: string[] = [
  "filesystem.delete_all",
  "filesystem.format",
  "system.shutdown",
  "system.reboot",
  "system.kill_process",
  "purchase.above_100",
  "auth.change_password",
  "auth.delete_account",
  "deploy.production_rollback",
  "database.drop_table",
  "database.truncate",
];

// ─── Config ───────────────────────────────────────────────────────────────────

export interface RiskLimiterConfig {
  userId: string;
  /** 1–10. Actions scored above this are queued instead of executed. */
  userRiskLimit: RiskLevel;
  supabaseUrl: string;
  supabaseServiceKey: string;
  anthropicApiKey: string;
}

// ─── RiskLimiter ──────────────────────────────────────────────────────────────

export class RiskLimiter {
  private config: RiskLimiterConfig;
  private anthropic: Anthropic;
  private supabase: SupabaseClient;

  constructor(config: RiskLimiterConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  /**
   * Main entry point. Returns a RiskDecision for any agent action.
   * Flow: hard-block check → Claude scoring → floor enforcement → threshold decision
   */
  async evaluate(action: AgentAction): Promise<RiskDecision> {
    // 1. Permanent hard blocks — no approval path
    if (this.isHardBlocked(action)) {
      const decision: RiskDecision = {
        decision: "block",
        score: 10,
        reason: `Tool "${action.toolName}" is permanently blocked and cannot be approved.`,
      };
      await this.logDecision(action, decision);
      return decision;
    }

    // 2. Ask Claude to score
    const { score: claudeScore, reason } = await this.scoreWithClaude(action);

    // 3. Enforce category floor
    const floor = CATEGORY_FLOOR[action.category];
    const score = Math.max(claudeScore, floor) as RiskLevel;

    // 4. Decide based on user's risk limit
    let outcome: DecisionOutcome;
    if (score > this.config.userRiskLimit) {
      outcome = "queue";
    } else {
      outcome = "execute";
    }

    const decision: RiskDecision = { decision: outcome, score, reason };

    // 5. Persist
    await this.logDecision(action, decision);
    if (outcome === "queue") {
      await this.queueForApproval(action, decision);
    }

    return decision;
  }

  /**
   * Asks Claude to score the action 1–10 and explain why.
   * Uses tool_choice to guarantee structured JSON output.
   */
  async scoreWithClaude(
    action: AgentAction
  ): Promise<{ score: RiskLevel; reason: string }> {
    const response = await this.anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      tools: [
        {
          name: "submit_risk_score",
          description: "Submit the risk score for the action being evaluated.",
          input_schema: {
            type: "object" as const,
            properties: {
              score: {
                type: "number",
                description:
                  "Risk score from 1 (completely safe) to 10 (catastrophic, irreversible).",
              },
              reason: {
                type: "string",
                description:
                  "One sentence explaining why you chose this score.",
              },
            },
            required: ["score", "reason"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_risk_score" },
      messages: [
        {
          role: "user",
          content: `You are a security evaluator for an AI agent system. Score the following agent action on a risk scale of 1–10.

1  = Read-only, fully reversible, no side effects
5  = Writes data or sends something, reversible with effort
7  = Deletes or deploys; hard to undo
9  = Financial or credential changes
10 = Catastrophic, irreversible (shutdown, delete all, etc.)

Action to evaluate:
- Tool: ${action.toolName}
- Category: ${action.category}
- Description: ${action.description}
- Input: ${JSON.stringify(action.input, null, 2)}

Score it.`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      // Fallback: use category floor
      return {
        score: CATEGORY_FLOOR[action.category],
        reason: "Claude scoring unavailable; applied category floor.",
      };
    }

    const input = toolUse.input as { score: number; reason: string };
    const score = Math.min(10, Math.max(1, Math.round(input.score))) as RiskLevel;
    return { score, reason: input.reason };
  }

  /** Returns true if the tool is on the permanent block list. */
  isHardBlocked(action: AgentAction): boolean {
    return ALWAYS_BLOCK.includes(action.toolName);
  }

  /** Saves an action to pending_approvals so a human can review it. */
  async queueForApproval(
    action: AgentAction,
    decision: RiskDecision
  ): Promise<void> {
    const { error } = await this.supabase.from("pending_approvals").insert({
      user_id: action.userId,
      agent_id: action.agentId,
      tool_name: action.toolName,
      category: action.category,
      description: action.description,
      input: action.input,
      risk_score: decision.score,
      risk_reason: decision.reason,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[RiskLimiter] Failed to queue for approval:", error.message);
    }
  }

  /** Saves every decision (execute, queue, or block) to the actions audit log. */
  async logDecision(action: AgentAction, decision: RiskDecision): Promise<void> {
    const { error } = await this.supabase.from("actions").insert({
      user_id: action.userId,
      agent_id: action.agentId,
      tool_name: action.toolName,
      category: action.category,
      description: action.description,
      input: action.input,
      risk_score: decision.score,
      risk_reason: decision.reason,
      decision: decision.decision,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[RiskLimiter] Failed to log decision:", error.message);
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRiskLimiter(config: RiskLimiterConfig): RiskLimiter {
  return new RiskLimiter(config);
}
