"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const USER_ID = "test-user-001";

interface Agent {
  id: string;
  name: string;
  goal: string;
  emoji: string;
  status: "idle" | "running" | "paused" | "error";
}

interface Approval {
  id: string;
  agent_id: string;
  category: string;
  tool: string;
  description: string;
  risk_score: number;
  risk_reason: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  idle: "bg-gray-50 text-gray-400",
  running: "bg-blue-50 text-blue-500",
  paused: "bg-yellow-50 text-yellow-600",
  error: "bg-red-50 text-red-500",
};

const STATUS_DOT: Record<string, string> = {
  idle: "bg-gray-300",
  running: "bg-blue-400 animate-pulse",
  paused: "bg-yellow-400",
  error: "bg-red-400",
};

const RISK_COLOR = (score: number) => {
  if (score <= 3) return "text-green-600 bg-green-50";
  if (score <= 6) return "text-yellow-600 bg-yellow-50";
  return "text-red-600 bg-red-50";
};

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [plan, setPlan] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const agentIdsRef = useRef<string[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll agent statuses
  const pollStatuses = useCallback(async () => {
    if (agentIdsRef.current.length === 0) return;
    try {
      const ids = agentIdsRef.current.join(",");
      const res = await fetch(`/api/agents/status?userId=${USER_ID}&ids=${ids}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.agents?.length) {
        setAgents((prev) =>
          prev.map((a) => {
            const fresh = data.agents.find((f: Agent) => f.id === a.id);
            return fresh ? { ...a, status: fresh.status } : a;
          })
        );
        // Stop polling when all agents are done
        const allDone = data.agents.every(
          (a: Agent) => a.status === "idle" || a.status === "error"
        );
        if (allDone) stopPolling();
      }
    } catch { /* ignore polling errors */ }
  }, []);

  // Poll approvals
  const pollApprovals = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/approvals?userId=${USER_ID}`);
      if (!res.ok) return;
      const data = await res.json();
      setApprovals(data.approvals ?? []);
    } catch { /* ignore */ }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(() => {
      pollStatuses();
      pollApprovals();
    }, 3000);
  }, [pollStatuses, pollApprovals]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function handleSubmit() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setAgents([]);
    setPlan("");
    setApprovals([]);
    stopPolling();

    try {
      const res = await fetch("/api/agents/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, userId: USER_ID }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to spawn agents.");
        return;
      }

      const spawnedAgents: Agent[] = (data.agents ?? []).map((a: Agent) => ({
        ...a,
        status: "running" as const,
      }));

      setAgents(spawnedAgents);
      setPlan(data.plan ?? "");
      agentIdsRef.current = spawnedAgents.map((a) => a.id);
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  async function resolveApproval(id: string, action: "approve" | "reject") {
    setResolvingId(id);
    try {
      await fetch("/api/agents/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setResolvingId(null);
    }
  }

  function handleReset() {
    stopPolling();
    setAgents([]);
    setPlan("");
    setPrompt("");
    setApprovals([]);
    setError("");
    agentIdsRef.current = [];
  }

  const allDone = agents.length > 0 && agents.every((a) => a.status === "idle" || a.status === "error");
  const anyRunning = agents.some((a) => a.status === "running");

  return (
    <main className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-start pt-20 px-6 pb-20">

      {/* Header */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-white border border-gray-100 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-6 shadow-sm">
          <span className={`w-1.5 h-1.5 rounded-full ${anyRunning ? "bg-blue-400 animate-pulse" : "bg-green-400"}`} />
          {anyRunning ? "Agents running..." : "System operational"}
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-3">
          FORGE OS
        </h1>
        <p className="text-gray-400 text-base">
          Type a goal. Your AI team handles everything.
        </p>
      </div>

      {/* Prompt box */}
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <textarea
            className="w-full p-5 text-sm text-gray-800 resize-none focus:outline-none bg-transparent placeholder-gray-300"
            placeholder="e.g. Help me launch my SaaS this week..."
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleSubmit();
            }}
          />
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50">
            <span className="text-xs text-gray-300">⌘ + Enter to run</span>
            <button
              onClick={handleSubmit}
              disabled={loading || !prompt.trim()}
              className="bg-black text-white text-xs font-medium px-5 py-2 rounded-full hover:bg-gray-800 disabled:opacity-30 transition-all"
            >
              {loading ? "Spawning..." : "Launch agents →"}
            </button>
          </div>
        </div>

        {/* Example prompts */}
        {agents.length === 0 && !loading && (
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {[
              "Research my top 3 competitors",
              "Draft a cold outreach email campaign",
              "Plan my product launch for next week",
              "Write landing page copy for my SaaS",
            ].map((example) => (
              <button
                key={example}
                onClick={() => setPrompt(example)}
                className="text-xs text-gray-400 border border-gray-100 bg-white rounded-full px-3 py-1.5 hover:border-gray-300 hover:text-gray-600 transition-all"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-6 w-full max-w-xl bg-red-50 border border-red-100 rounded-2xl p-4 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400">Decomposing goal into agents...</p>
        </div>
      )}

      {/* Results */}
      {agents.length > 0 && (
        <div className="w-full max-w-xl mt-10">

          {/* Plan summary */}
          {plan && (
            <p className="text-xs text-gray-400 text-center mb-6 leading-relaxed px-4">
              {plan}
            </p>
          )}

          {/* Status legend */}
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs text-gray-400 font-medium">{agents.length} agents deployed</p>
            {allDone && (
              <span className="text-xs text-green-600 font-medium">All done ✓</span>
            )}
            {anyRunning && (
              <span className="text-xs text-blue-500">Live updates every 3s</span>
            )}
          </div>

          {/* Agent cards */}
          <div className="flex flex-col gap-3">
            {agents.map((agent, i) => (
              <div
                key={agent.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex items-start gap-4 shadow-sm"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
                  {agent.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 flex items-center gap-1.5 ${STATUS_STYLES[agent.status] ?? STATUS_STYLES.idle}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agent.status] ?? STATUS_DOT.idle}`} />
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {agent.goal}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Pending approvals */}
          {approvals.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <p className="text-xs font-medium text-gray-700">
                  {approvals.length} action{approvals.length !== 1 ? "s" : ""} waiting for approval
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {approvals.map((approval) => (
                  <div key={approval.id} className="bg-white border border-yellow-100 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_COLOR(approval.risk_score ?? 0)}`}>
                            Risk {approval.risk_score}/10
                          </span>
                          <span className="text-xs text-gray-400">{approval.tool}</span>
                        </div>
                        <p className="text-sm text-gray-800 font-medium leading-snug">
                          {approval.description}
                        </p>
                        {approval.risk_reason && (
                          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                            {approval.risk_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => resolveApproval(approval.id, "approve")}
                        disabled={resolvingId === approval.id}
                        className="flex-1 text-xs font-medium py-2 rounded-xl bg-black text-white hover:bg-gray-800 disabled:opacity-40 transition-all"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => resolveApproval(approval.id, "reject")}
                        disabled={resolvingId === approval.id}
                        className="flex-1 text-xs font-medium py-2 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-all border border-gray-100"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reset */}
          <button
            onClick={handleReset}
            className="mt-8 w-full text-xs text-gray-300 hover:text-gray-500 py-3 transition-all"
          >
            ← Start over
          </button>
        </div>
      )}
    </main>
  );
}
