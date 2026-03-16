"use client";

import { useState, useRef, useCallback } from "react";
import type { StreamEvent, AgentMeta, AgentResult } from "@/app/api/agents/run/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "spawning" | "running" | "done" | "error";

interface AgentState extends AgentMeta {
  status: "waiting" | "running" | "done" | "failed";
  result?: AgentResult;
  errorMessage?: string;
}

// ─── Example prompts ──────────────────────────────────────────────────────────

const EXAMPLES = [
  "Research the top 5 AI coding tools in 2025 and write a comparison note",
  "Find recent news about climate tech startups and draft a tweet thread",
  "Research best practices for remote team management and create a summary doc",
  "Look up the latest Next.js features and draft a blog post outline",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: AgentState["status"] }) {
  if (status === "waiting")
    return <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />;
  if (status === "running")
    return (
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
    );
  if (status === "done")
    return <span className="inline-block h-2 w-2 rounded-full bg-green-500" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-red-500" />;
}

function AgentCard({ agent }: { agent: AgentState }) {
  const borderColor = {
    waiting: "border-zinc-800",
    running: "border-blue-900",
    done: "border-green-900",
    failed: "border-red-900",
  }[agent.status];

  const bgColor = {
    waiting: "bg-zinc-900",
    running: "bg-blue-950/30",
    done: "bg-green-950/30",
    failed: "bg-red-950/30",
  }[agent.status];

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-5 flex flex-col gap-3 transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{agent.emoji}</span>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">{agent.name}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <StatusDot status={agent.status} />
              <span className="text-xs capitalize text-zinc-500">{agent.status}</span>
            </div>
          </div>
        </div>
        {agent.status === "done" && agent.result && (
          <span className="shrink-0 rounded-full bg-green-950 px-2 py-0.5 text-xs text-green-400">
            {agent.result.stepsExecuted} steps
          </span>
        )}
      </div>

      {/* Goal */}
      <p className="text-xs text-zinc-400 leading-relaxed">{agent.goal}</p>

      {/* Result summary */}
      {agent.status === "done" && agent.result?.summary && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-300 leading-relaxed line-clamp-6">
            {agent.result.summary}
          </p>
          {(agent.result.actionsBlocked > 0 || agent.result.actionsQueued > 0) && (
            <div className="mt-2 flex gap-3">
              {agent.result.actionsBlocked > 0 && (
                <span className="text-xs text-red-400">
                  {agent.result.actionsBlocked} blocked
                </span>
              )}
              {agent.result.actionsQueued > 0 && (
                <span className="text-xs text-yellow-400">
                  {agent.result.actionsQueued} queued
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {agent.status === "failed" && agent.errorMessage && (
        <p className="text-xs text-red-400 leading-relaxed">{agent.errorMessage}</p>
      )}

      {/* Running shimmer */}
      {agent.status === "running" && (
        <div className="space-y-1.5">
          <div className="h-2 rounded bg-zinc-800 animate-pulse" />
          <div className="h-2 w-3/4 rounded bg-zinc-800 animate-pulse" />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgentRunner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const updateAgent = useCallback(
    (id: string, patch: Partial<AgentState>) =>
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      ),
    []
  );

  async function run() {
    if (!prompt.trim() || phase === "running" || phase === "spawning") return;

    // Reset state
    setPlan(null);
    setAgents([]);
    setErrorMessage(null);
    setPhase("spawning");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(text);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (event.type === "plan") {
            setPlan(event.data.plan);
            setAgents(
              event.data.agents.map((a) => ({ ...a, status: "waiting" }))
            );
            setPhase("running");
          } else if (event.type === "agent_start") {
            updateAgent(event.data.id, { status: "running" });
          } else if (event.type === "agent_done") {
            updateAgent(event.data.id, {
              status: "done",
              result: event.data.result,
            });
          } else if (event.type === "agent_error") {
            updateAgent(event.data.id, {
              status: "failed",
              errorMessage: event.data.message,
            });
          } else if (event.type === "complete") {
            setPhase("done");
          } else if (event.type === "error") {
            setErrorMessage(event.data.message);
            setPhase("error");
          }
        }
      }

      // Ensure phase is done if stream ended without complete event
      setPhase((p) => (p === "running" ? "done" : p));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setPhase("idle");
    setPlan(null);
    setAgents([]);
    setErrorMessage(null);
  }

  const isActive = phase === "spawning" || phase === "running";
  const doneCount = agents.filter((a) => a.status === "done").length;
  const failedCount = agents.filter((a) => a.status === "failed").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">

      {/* ── Prompt input ── */}
      <div className={`transition-all duration-500 ${phase !== "idle" ? "mb-8" : "mb-0"}`}>
        {phase === "idle" && (
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white">What should your agents do?</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Describe any task in plain English. forge-os will decompose it into a team of agents and run them in parallel.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
            placeholder="e.g. Research the top AI tools of 2025 and write a summary blog post…"
            rows={3}
            disabled={isActive}
            className="w-full resize-none bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-zinc-600">⌘ + Enter to run</span>
            <div className="flex gap-2">
              {(phase === "done" || phase === "error") && (
                <button
                  onClick={reset}
                  className="rounded-lg border border-zinc-700 px-4 py-1.5 text-xs font-medium text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  New task
                </button>
              )}
              <button
                onClick={run}
                disabled={!prompt.trim() || isActive}
                className="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isActive ? "Running…" : "Launch agents →"}
              </button>
            </div>
          </div>
        </div>

        {/* Example prompts */}
        {phase === "idle" && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors text-left"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Spawning state ── */}
      {phase === "spawning" && (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="inline-flex gap-1">
            <span className="animate-bounce delay-0">·</span>
            <span className="animate-bounce delay-75">·</span>
            <span className="animate-bounce delay-150">·</span>
          </span>
          Planning your agent team…
        </div>
      )}

      {/* ── Plan text ── */}
      {plan && (
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Plan</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{plan}</p>
        </div>
      )}

      {/* ── Agent cards ── */}
      {agents.length > 0 && (
        <>
          <div
            className={`grid gap-4 ${
              agents.length === 2
                ? "sm:grid-cols-2"
                : agents.length >= 3
                ? "sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1"
            }`}
          >
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          {/* Progress bar */}
          {isActive && agents.length > 0 && (
            <div className="mt-6">
              <div className="mb-1.5 flex justify-between text-xs text-zinc-500">
                <span>
                  {doneCount + failedCount} / {agents.length} agents finished
                </span>
                <span>{Math.round(((doneCount + failedCount) / agents.length) * 100)}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-zinc-800">
                <div
                  className="h-1 rounded-full bg-white transition-all duration-500"
                  style={{
                    width: `${((doneCount + failedCount) / agents.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Done summary ── */}
      {phase === "done" && agents.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">All agents finished</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {doneCount} succeeded
              {failedCount > 0 && `, ${failedCount} failed`}
              {" · "}
              {agents.reduce((sum, a) => sum + (a.result?.stepsExecuted ?? 0), 0)} total steps
              {" · "}
              {agents.reduce((sum, a) => sum + (a.result?.actionsBlocked ?? 0), 0)} blocked
            </p>
          </div>
          <button
            onClick={reset}
            className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-colors"
          >
            New task
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {phase === "error" && errorMessage && (
        <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-5 py-4">
          <p className="text-sm font-medium text-red-400">Something went wrong</p>
          <p className="mt-1 text-xs text-red-400/80">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
