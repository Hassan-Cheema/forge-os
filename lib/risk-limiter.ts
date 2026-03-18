import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type RiskLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ActionCategory =
  | "read"          // read files, browse, search
  | "write"         // write files, create folders
  | "send"          // send emails, post to social
  | "execute"       // run terminal commands
  | "delete"        // delete files, remove data
  | "deploy"        // push code, deploy to server
  | "purchase"      // spend money, make transactions
  | "auth"          // login, OAuth, credentials
  | "api_call"      // call external APIs
  | "system";       // OS-level operations

export interface AgentAction {
  id: string;
  agentId: string;
  userId: string;
  category: ActionCategory;
  description: string;            // human-readable: "Send email to john@acme.com"
  tool: string;                   // e.g. "email.send", "filesystem.delete"
  payload: Record<string, unknown>; // the actual data being acted on
  context?: string;               // why the agent wants to do this
  createdAt: Date;
}

export type RiskDecision =
  | { verdict: "execute"; riskScore: RiskLevel; reason: string }
  | { verdict: "queue"; riskScore: RiskLevel; reason: string; approvalId: string }
  | { verdict: "block"; riskScore: RiskLevel; reason: string };

export interface RiskLimiterConfig {
  userId: string;
  userRiskLimit: RiskLevel;       // user's threshold: auto-execute below this
  supabaseUrl: string;
  supabaseServiceKey: string;
  anthropicApiKey: string;
}

// ─────────────────────────────────────────────
// Static risk floor per category
// (Claude may raise this, never lower it)
// ─────────────────────────────────────────────

const CATEGORY_FLOOR: Record<ActionCategory, RiskLevel> = {
  read: 1,
  api_call: 2,
  write: 3,
  send: 5,
  auth: 5,
  execute: 6,
  deploy: 7,
  delete: 7,
  purchase: 9,
  system: 8,
};

// Actions that are ALWAYS blocked regardless of user limit
const ALWAYS_BLOCK: string[] = [
  "filesystem.delete_all",
  "system.shutdown",
  "system.format",
  "auth.change_password",
  "purchase.above_100",
];

// ─────────────────────────────────────────────
// RiskLimiter class
// ─────────────────────────────────────────────

export class RiskLimiter {
  private anthropic: Anthropic;
  private supabase: ReturnType<typeof createClient<Database>>;
  private config: RiskLimiterConfig;

  constructor(config: RiskLimiterConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.supabase = createClient<Database>(config.supabaseUrl, config.supabaseServiceKey);
  }

  // ─── Main entry point ───────────────────────

  async evaluate(action: AgentAction): Promise<RiskDecision> {

    // 1. Hard block list — no AI needed
    if (this.isHardBlocked(action)) {
      await this.logDecision(action, "block", 10, "Action is permanently blocked.");
      return {
        verdict: "block",
        riskScore: 10,
        reason: `'${action.tool}' is permanently blocked for safety. FORGE OS will never perform this action.`,
      };
    }

    // 2. Ask Claude to score the action
    const { score, reason } = await this.scoreWithClaude(action);

    // 3. Apply category floor — never go below the minimum for this category
    const floor = CATEGORY_FLOOR[action.category];
    const finalScore = Math.max(score, floor) as RiskLevel;

    // 4. Apply verdict
    if (finalScore === 10) {
      await this.logDecision(action, "block", finalScore, reason);
      return { verdict: "block", riskScore: finalScore, reason };
    }

    if (finalScore > this.config.userRiskLimit) {
      const approvalId = await this.queueForApproval(action, finalScore, reason);
      await this.logDecision(action, "queue", finalScore, reason);
      return { verdict: "queue", riskScore: finalScore, reason, approvalId };
    }

    await this.logDecision(action, "execute", finalScore, reason);
    return { verdict: "execute", riskScore: finalScore, reason };
  }

  // ─── Claude scoring ──────────────────────────

  private async scoreWithClaude(
    action: AgentAction
  ): Promise<{ score: RiskLevel; reason: string }> {

    const prompt = `You are the security brain of FORGE OS — an autonomous AI agent platform.
Your job: score the risk of an agent action on a scale of 1–10.

SCORING GUIDE:
1–2  = Safe, read-only, reversible (browsing, reading files, summarising)
3–4  = Low risk, minor writes, no external effect (creating a draft, organising folders)
5–6  = Medium risk, external effect but reversible (sending 1 email, posting a draft tweet)
7–8  = High risk, hard to undo (deleting files, running shell commands, deploying code)
9    = Very high risk (spending money, mass-sending emails, modifying credentials)
10   = BLOCK — catastrophic, irreversible, or clearly malicious

ACTION TO SCORE:
- Category: ${action.category}
- Tool: ${action.tool}
- Description: ${action.description}
- Context (why agent wants this): ${action.context ?? "not provided"}
- Payload preview: ${JSON.stringify(action.payload).slice(0, 300)}

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{"score": <number 1-10>, "reason": "<one sentence explaining the score>"}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      const parsed = JSON.parse(text.trim());
      const score = Math.min(10, Math.max(1, Math.round(parsed.score))) as RiskLevel;
      const reason = parsed.reason ?? "No reason provided.";

      return { score, reason };

    } catch {
      // If Claude fails, apply conservative fallback based on category
      const fallbackScore = Math.min(
        10,
        CATEGORY_FLOOR[action.category] + 2
      ) as RiskLevel;
      return {
        score: fallbackScore,
        reason: `Risk scored conservatively (Claude unavailable). Category '${action.category}' floor applied.`,
      };
    }
  }

  // ─── Hard block check ───────────────────────

  private isHardBlocked(action: AgentAction): boolean {
    return ALWAYS_BLOCK.includes(action.tool);
  }

  // ─── Queue for user approval ─────────────────

  private async queueForApproval(
    action: AgentAction,
    riskScore: RiskLevel,
    reason: string
  ): Promise<string> {
    const { data, error } = await (this.supabase
      .from("pending_approvals") as any)
      .insert({
        user_id: action.userId,
        agent_id: action.agentId,
        action_id: action.id,
        category: action.category,
        description: action.description,
        tool: action.tool,
        payload: action.payload,
        risk_score: riskScore,
        risk_reason: reason,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw new Error(`Failed to queue approval: ${error.message}`);
    return data.id;
  }

  // ─── Audit log ───────────────────────────────

  private async logDecision(
    action: AgentAction,
    verdict: "execute" | "queue" | "block",
    riskScore: RiskLevel,
    reason: string
  ): Promise<void> {
    await (this.supabase.from("actions") as any).insert({
      id: action.id,
      user_id: action.userId,
      agent_id: action.agentId,
      category: action.category,
      tool: action.tool,
      description: action.description,
      payload: action.payload,
      risk_score: riskScore,
      risk_reason: reason,
      verdict,
      created_at: new Date().toISOString(),
    });
  }
}

// ─────────────────────────────────────────────
// Factory helper — use this in your agents
// ─────────────────────────────────────────────

export function createRiskLimiter(userId: string, userRiskLimit: RiskLevel = 6) {
  return new RiskLimiter({
    userId,
    userRiskLimit,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  });
}

// ─────────────────────────────────────────────
// Usage example (remove before shipping)
// ─────────────────────────────────────────────

/*
import { createRiskLimiter } from "@/lib/risk-limiter";

const limiter = createRiskLimiter("user_abc123", 6);

const decision = await limiter.evaluate({
  id: crypto.randomUUID(),
  agentId: "agent_research_01",
  userId: "user_abc123",
  category: "send",
  tool: "email.send",
  description: "Send follow-up email to investor@vc.com",
  payload: { to: "investor@vc.com", subject: "FORGE OS update", body: "..." },
  context: "User asked me to follow up on the pitch deck sent last week",
  createdAt: new Date(),
});

if (decision.verdict === "execute") {
  // safe — run it
} else if (decision.verdict === "queue") {
  // paused — waiting for user tap in dashboard
  console.log("Queued for approval:", decision.approvalId);
} else {
  // blocked — log and skip
  console.log("Blocked:", decision.reason);
}
*/
