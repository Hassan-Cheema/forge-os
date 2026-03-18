import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createRiskLimiter, type AgentAction, type RiskLevel } from "../risk-limiter";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "paused" | "error";

export interface AgentTool {
    name: string;                          // e.g. "search_web"
    description: string;                   // what Claude sees
    input_schema: Record<string, unknown>; // JSON schema for inputs
    category: AgentAction["category"];     // for risk scoring
    riskDescription: string;               // human-readable risk context
    execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface BaseAgentConfig {
    id: string;
    userId: string;
    name: string;
    goal: string;
    tools: AgentTool[];
    userRiskLimit?: RiskLevel;
    maxSteps?: number;               // safety ceiling — default 20
    systemPrompt?: string;           // override default system prompt
}

export interface AgentRunResult {
    success: boolean;
    stepsExecuted: number;
    actionsBlocked: number;
    actionsQueued: number;
    summary: string;
    error?: string;
}

// ─────────────────────────────────────────────
// BaseAgent
// ─────────────────────────────────────────────

export class BaseAgent {
    protected config: BaseAgentConfig;
    protected anthropic: Anthropic;
    protected supabase: ReturnType<typeof createClient>;
    protected status: AgentStatus = "idle";

    constructor(config: BaseAgentConfig) {
        this.config = config;
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
        });
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }

    // ─── Main run loop ───────────────────────────

    async run(): Promise<AgentRunResult> {
        const maxSteps = this.config.maxSteps ?? 20;
        let steps = 0;
        let actionsBlocked = 0;
        let actionsQueued = 0;

        await this.setStatus("running");
        await this.log(`Agent started. Goal: ${this.config.goal}`);

        const messages: Anthropic.MessageParam[] = [
            { role: "user", content: this.config.goal },
        ];

        const tools = this.buildClaudeTools();

        try {
            // Agentic loop — keeps going until Claude says stop or maxSteps hit
            while (steps < maxSteps) {
                steps++;

                const response = await this.anthropic.messages.create({
                    model: "claude-sonnet-4-20250514",
                    max_tokens: 4096,
                    system: this.buildSystemPrompt(),
                    tools,
                    messages,
                });

                await this.log(`Step ${steps}: stop_reason=${response.stop_reason}`);

                // Claude is done — no more tool calls
                if (response.stop_reason === "end_turn") {
                    const finalText = response.content
                        .filter((b) => b.type === "text")
                        .map((b) => (b as Anthropic.TextBlock).text)
                        .join("\n");

                    await this.setStatus("idle");
                    await this.log(`Completed. ${finalText.slice(0, 200)}`);

                    return {
                        success: true,
                        stepsExecuted: steps,
                        actionsBlocked,
                        actionsQueued,
                        summary: finalText,
                    };
                }

                // Claude wants to use tools
                if (response.stop_reason === "tool_use") {
                    const toolUseBlocks = response.content.filter(
                        (b) => b.type === "tool_use"
                    ) as Anthropic.ToolUseBlock[];

                    // Add Claude's response to message history
                    messages.push({ role: "assistant", content: response.content });

                    const toolResults: Anthropic.ToolResultBlockParam[] = [];

                    for (const toolUse of toolUseBlocks) {
                        const result = await this.handleToolCall(
                            toolUse,
                            actionsBlocked,
                            actionsQueued
                        );

                        actionsBlocked = result.actionsBlocked;
                        actionsQueued = result.actionsQueued;

                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: toolUse.id,
                            content: result.output,
                        });
                    }

                    // Feed tool results back to Claude
                    messages.push({ role: "user", content: toolResults });
                    continue;
                }

                // Unexpected stop reason — bail safely
                break;
            }

            // Hit step limit
            await this.setStatus("idle");
            return {
                success: true,
                stepsExecuted: steps,
                actionsBlocked,
                actionsQueued,
                summary: `Completed ${steps} steps (limit reached).`,
            };

        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await this.setStatus("error");
            await this.log(`Error: ${message}`);
            return {
                success: false,
                stepsExecuted: steps,
                actionsBlocked,
                actionsQueued,
                summary: "",
                error: message,
            };
        }
    }

    // ─── Tool call handler (risk check happens here) ─

    private async handleToolCall(
        toolUse: Anthropic.ToolUseBlock,
        actionsBlocked: number,
        actionsQueued: number
    ): Promise<{
        output: string;
        actionsBlocked: number;
        actionsQueued: number;
    }> {
        const tool = this.config.tools.find((t) => t.name === toolUse.name);

        if (!tool) {
            return {
                output: `Error: tool '${toolUse.name}' not found.`,
                actionsBlocked,
                actionsQueued,
            };
        }

        const input = toolUse.input as Record<string, unknown>;

        // ── Run through risk limiter before executing ──
        const limiter = createRiskLimiter(
            this.config.userId,
            this.config.userRiskLimit ?? 6
        );

        const action: AgentAction = {
            id: crypto.randomUUID(),
            agentId: this.config.id,
            userId: this.config.userId,
            category: tool.category,
            tool: tool.name,
            description: `${tool.name}: ${JSON.stringify(input).slice(0, 150)}`,
            payload: input,
            context: tool.riskDescription,
            createdAt: new Date(),
        };

        const decision = await limiter.evaluate(action);

        await this.log(
            `Tool '${tool.name}' → risk ${decision.riskScore}/10 → ${decision.verdict}`
        );

        if (decision.verdict === "block") {
            actionsBlocked++;
            return {
                output: `Action blocked (risk ${decision.riskScore}/10): ${decision.reason}`,
                actionsBlocked,
                actionsQueued,
            };
        }

        if (decision.verdict === "queue") {
            actionsQueued++;
            return {
                output: `Action paused — waiting for your approval in the FORGE OS dashboard. Approval ID: ${decision.approvalId}. Risk: ${decision.riskScore}/10.`,
                actionsBlocked,
                actionsQueued,
            };
        }

        // verdict === "execute" — safe to run
        try {
            const result = await tool.execute(input);
            const output =
                typeof result === "string" ? result : JSON.stringify(result);
            await this.log(`Tool '${tool.name}' executed successfully.`);
            return { output, actionsBlocked, actionsQueued };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                output: `Tool execution error: ${message}`,
                actionsBlocked,
                actionsQueued,
            };
        }
    }

    // ─── Build Claude tool definitions ───────────

    private buildClaudeTools(): Anthropic.Tool[] {
        return this.config.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool["input_schema"],
        }));
    }

    // ─── System prompt ────────────────────────────

    private buildSystemPrompt(): string {
        if (this.config.systemPrompt) return this.config.systemPrompt;

        return `You are ${this.config.name}, an autonomous AI agent running inside FORGE OS.

Your goal: ${this.config.goal}

Rules:
- Use your tools to complete the goal step by step
- Be efficient — don't repeat actions you've already done
- If a tool call is blocked or queued for approval, acknowledge it and continue with what you can do
- When you have completed the goal or can't proceed further, summarise what you did
- Never make up results — only report what tools actually returned
- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;
    }

    // ─── Status + logging ─────────────────────────

    private async setStatus(status: AgentStatus): Promise<void> {
        this.status = status;
        await (this.supabase.from("agents") as any)
            .update({ status })
            .eq("id", this.config.id);
    }

    private async log(message: string): Promise<void> {
        console.log(`[${this.config.name}] ${message}`);
        // Optionally write to a logs table here later
    }

    getStatus(): AgentStatus {
        return this.status;
    }
}
