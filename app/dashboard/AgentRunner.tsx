"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { StreamEvent, AgentMeta, AgentResult } from "@/app/api/agents/run/route";
import type { Report } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "spawning" | "running" | "synthesizing" | "done" | "error";
type Mode = "research" | "latex";

interface AgentState extends AgentMeta {
  status: "waiting" | "running" | "done" | "failed";
  result?: AgentResult;
  errorMessage?: string;
}

interface PendingApproval {
  id: string;
  tool_name: string;
  category: string;
  description: string | null;
  risk_score: number;
  risk_reason: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openInOverleaf(latex: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "https://www.overleaf.com/docs";
  form.target = "_blank";
  form.rel = "noopener noreferrer";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "snip";
  input.value = latex;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAMPLES: Record<Mode, string[]> = {
  research: [
    "Research the top 5 AI coding tools in 2025 and write a comparison note",
    "Find recent news about climate tech startups and draft a tweet thread",
    "Research best practices for remote team management and create a summary doc",
    "Look up the latest Next.js features and draft a blog post outline",
  ],
  latex: [
    "Write an academic paper on the impact of large language models on software engineering",
    "Produce a research paper surveying recent advances in quantum computing",
    "Write a paper on the environmental impact of data centres",
    "Produce an academic review of reinforcement learning from human feedback",
  ],
};

// ─── Markdown theme ───────────────────────────────────────────────────────────

const md: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-lg font-bold text-white first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-5 text-base font-bold text-white first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-100 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-zinc-300 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => <ul className="mb-3 space-y-1 pl-1">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 text-sm leading-relaxed text-zinc-300">
      <span className="mt-0.5 shrink-0 text-zinc-600">•</span>
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-zinc-400">{children}</em>,
  hr: () => <hr className="my-5 border-zinc-800" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-zinc-700 pl-4 italic text-zinc-400">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) =>
    className?.startsWith("language-") ? (
      <code className="block overflow-x-auto rounded-lg bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-200">
        {children}
      </code>
    ) : (
      <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-200">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-zinc-950 p-0">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-zinc-800/60">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-y divide-zinc-800/60">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-zinc-800/30">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2.5 text-left font-semibold text-zinc-200">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2.5 text-zinc-300">{children}</td>
  ),
};

// ─── StatusDot ────────────────────────────────────────────────────────────────

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

// ─── AgentCard ────────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentState }) {
  const border = {
    waiting: "border-zinc-800",
    running: "border-blue-900",
    done: "border-green-900",
    failed: "border-red-900",
  }[agent.status];

  const bg = {
    waiting: "bg-zinc-900/40",
    running: "bg-blue-950/30",
    done: "bg-green-950/20",
    failed: "bg-red-950/30",
  }[agent.status];

  return (
    <div className={`rounded-lg border ${border} ${bg} px-4 py-3 transition-all duration-300`}>
      <div className="flex items-center gap-2.5">
        <span className="text-lg leading-none">{agent.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{agent.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <StatusDot status={agent.status} />
            <span className="text-xs capitalize text-zinc-500">{agent.status}</span>
            {agent.result && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-xs text-zinc-500">
                  {agent.result.stepsExecuted} steps
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {agent.status === "running" && (
        <div className="mt-2.5 space-y-1">
          <div className="h-1 animate-pulse rounded-full bg-zinc-800" />
          <div className="h-1 w-2/3 animate-pulse rounded-full bg-zinc-800" />
        </div>
      )}

      {agent.status === "failed" && agent.errorMessage && (
        <p className="mt-1.5 text-xs text-red-400">{agent.errorMessage}</p>
      )}
    </div>
  );
}

// ─── ModeToggle ───────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
      <button
        onClick={() => onChange("research")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
          mode === "research"
            ? "bg-white text-zinc-950 shadow-sm"
            : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        📄 Research Report
      </button>
      <button
        onClick={() => onChange("latex")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
          mode === "latex"
            ? "bg-white text-zinc-950 shadow-sm"
            : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        📐 LaTeX Paper
      </button>
    </div>
  );
}

// ─── LaTeXViewer ─────────────────────────────────────────────────────────────

function buildPreviewHtml(source: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LaTeX Preview</title>
<script src="https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/latex.js"><\/script>
<style>
  *{box-sizing:border-box}
  body{background:#fff;color:#111;padding:2.5rem 3rem;font-family:Georgia,'Times New Roman',serif;max-width:800px;margin:0 auto;line-height:1.75;font-size:14px}
  #loading{font:13px/1.6 system-ui,sans-serif;color:#6b7280;padding:2rem 0;text-align:center}
  #err{color:#b91c1c;font:12px/1.6 monospace;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-top:1rem;display:none}
</style>
</head>
<body>
<div id="loading">Rendering LaTeX\u2026</div>
<div id="output"></div>
<div id="err"></div>
<script>
window.addEventListener("DOMContentLoaded", function () {
  var src = ${JSON.stringify(source)};
  try {
    var g = new latexjs.HtmlGenerator({ hyphenate: false });
    var d = latexjs.parse(src, { generator: g });
    document.head.appendChild(
      d.stylesAndScripts("https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/")
    );
    document.getElementById("output").appendChild(d.domFragment());
    document.getElementById("loading").remove();
  } catch (e) {
    document.getElementById("loading").remove();
    var el = document.getElementById("err");
    el.style.display = "block";
    el.textContent = "Preview failed: " + e.message +
      " \u2014 download the .tex file to compile a full PDF.";
  }
});
<\/script>
</body>
</html>`;
}

function LaTeXViewer({ text, streaming }: { text: string; streaming: boolean }) {
  const [preview, setPreview] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  function openPreview() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    const blob = new Blob([buildPreviewHtml(text)], { type: "text/html" });
    setBlobUrl(URL.createObjectURL(blob));
    setPreview(true);
  }

  function closePreview() {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setPreview(false);
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          onClick={preview ? closePreview : openPreview}
          disabled={streaming || !text}
          className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-40"
        >
          {preview ? "← Source" : "Preview →"}
        </button>
      </div>

      {preview && blobUrl ? (
        <iframe
          src={blobUrl}
          className="w-full rounded-lg border border-zinc-700 bg-white"
          style={{ height: "640px" }}
          sandbox="allow-scripts"
          title="LaTeX Preview"
        />
      ) : (
        <div className="relative overflow-x-auto rounded-lg bg-zinc-950 px-5 py-4">
          {streaming && (
            <span className="absolute right-3 top-3 flex items-center gap-0.5 text-xs text-zinc-600">
              <span className="animate-bounce">·</span>
              <span className="animate-bounce [animation-delay:75ms]">·</span>
              <span className="animate-bounce [animation-delay:150ms]">·</span>
            </span>
          )}
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-300">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── PendingApprovals ─────────────────────────────────────────────────────────

function PendingApprovals({ active }: { active: boolean }) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!active) {
      setApprovals([]);
      return;
    }

    async function poll() {
      const res = await fetch("/api/agents/approvals");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals ?? []);
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [active]);

  async function resolve(id: string, action: "approve" | "reject") {
    setResolving((prev) => new Set(prev).add(id));
    await fetch("/api/agents/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    setResolving((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  if (approvals.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-yellow-900/60 bg-yellow-950/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-widest text-yellow-600">
          Pending approvals ({approvals.length})
        </p>
      </div>
      <div className="space-y-2">
        {approvals.map((a) => (
          <div
            key={a.id}
            className="rounded-lg border border-yellow-900/40 bg-yellow-950/30 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 font-mono text-[10px] text-yellow-400">
                    {a.tool_name}
                  </span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {a.category}
                  </span>
                  <span className="text-[10px] text-yellow-700 font-medium">
                    risk {a.risk_score}/10
                  </span>
                </div>
                {a.description && (
                  <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed">{a.description}</p>
                )}
                {a.risk_reason && (
                  <p className="mt-1 text-[10px] text-zinc-500 italic">{a.risk_reason}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => resolve(a.id, "approve")}
                  disabled={resolving.has(a.id)}
                  className="rounded-md border border-green-800 bg-green-950/40 px-2.5 py-1 text-xs font-medium text-green-400 transition-colors hover:bg-green-900/40 disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  onClick={() => resolve(a.id, "reject")}
                  disabled={resolving.has(a.id)}
                  className="rounded-md border border-red-900 bg-red-950/40 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/40 disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ReportItem ───────────────────────────────────────────────────────────────

function ReportItem({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const isLatex = report.type === "latex";

  const date = new Date(report.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  function download() {
    const ext = isLatex ? "tex" : "md";
    const mime = isLatex ? "application/x-tex" : "text/markdown";
    const blob = new Blob([report.content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden transition-all">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">{isLatex ? "📐" : "📄"}</span>
            <p className="truncate text-sm text-zinc-200">{report.prompt}</p>
          </div>
          <p className="mt-0.5 text-xs text-zinc-600">{date}</p>
        </div>
        <span className="mt-0.5 shrink-0 text-xs text-zinc-500">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-800">
          <div className="flex justify-end gap-2 px-4 py-2 border-b border-zinc-800/60">
            {isLatex && (
              <button
                onClick={() => openInOverleaf(report.content)}
                className="rounded-md border border-blue-900 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-900/40 hover:text-blue-300"
              >
                ↗ Preview PDF
              </button>
            )}
            <button
              onClick={download}
              className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
            >
              ↓ {isLatex ? "Download .tex" : "Download .md"}
            </button>
          </div>
          <div className="px-5 py-5">
            {isLatex ? (
              <LaTeXViewer text={report.content} streaming={false} />
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
                {report.content}
              </ReactMarkdown>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs transition-colors hover:border-zinc-500 hover:text-white"
      style={{ color: copied ? "#4ade80" : undefined }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgentRunner({
  userId,
  reports,
}: {
  userId: string;
  reports: Report[];
}) {
  void userId; // used by PendingApprovals via API auth (cookie-based)
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("research");
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [synthesis, setSynthesis] = useState("");
  const [synthesisDone, setSynthesisDone] = useState(false);
  const [activeMode, setActiveMode] = useState<Mode>("research");
  const [showAgentDetails, setShowAgentDetails] = useState(false);
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

    const runMode = mode;

    setPlan(null);
    setAgents([]);
    setSynthesis("");
    setSynthesisDone(false);
    setShowAgentDetails(false);
    setErrorMessage(null);
    setActiveMode(runMode);
    setPhase("spawning");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const endpoint = runMode === "latex" ? "/api/agents/latex" : "/api/agents/run";

    try {
      const res = await fetch(endpoint, {
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
              event.data.agents.map((a: AgentMeta) => ({
                ...a,
                status: "waiting" as const,
              }))
            );
            setPhase("running");
          } else if (event.type === "agent_start") {
            updateAgent(event.data.id, { status: "running" });
          } else if (event.type === "agent_done") {
            updateAgent(event.data.id, { status: "done", result: event.data.result });
          } else if (event.type === "agent_error") {
            updateAgent(event.data.id, {
              status: "failed",
              errorMessage: event.data.message,
            });
          } else if (event.type === "synthesis_start") {
            setPhase("synthesizing");
          } else if (event.type === "synthesis_chunk") {
            setSynthesis((prev) => prev + event.data.text);
          } else if (event.type === "synthesis_done") {
            setSynthesisDone(true);
          } else if (event.type === "complete") {
            setPhase("done");
          } else if (event.type === "error") {
            setErrorMessage(event.data.message);
            setPhase("error");
          }
        }
      }

      setPhase((p) => (p === "running" || p === "synthesizing" ? "done" : p));
      router.refresh();
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
    setSynthesis("");
    setSynthesisDone(false);
    setShowAgentDetails(false);
    setErrorMessage(null);
    setPrompt("");
  }

  function downloadAnswer() {
    const isLatex = activeMode === "latex";
    const ext = isLatex ? "tex" : "md";
    const mime = isLatex ? "application/x-tex" : "text/plain";
    const blob = new Blob([synthesis], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `answer.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isActive = phase === "spawning" || phase === "running";
  const isSynthesizing = phase === "synthesizing";
  const doneCount = agents.filter((a) => a.status === "done").length;
  const failedCount = agents.filter((a) => a.status === "failed").length;
  const totalSteps = agents.reduce((s, a) => s + (a.result?.stepsExecuted ?? 0), 0);
  const isLatexRun = activeMode === "latex";
  const approvalsActive = isActive || isSynthesizing;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">

      {/* ── Prompt input ──────────────────────────────────────────────────── */}
      <div className={phase !== "idle" ? "mb-6" : "mb-0"}>
        {phase === "idle" && (
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-white">
              What should your agents do?
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Describe any task in plain English — forge-os breaks it into agents,
              runs them in parallel, and gives you one clean answer.
            </p>
            <div className="mt-5 flex justify-center">
              <ModeToggle mode={mode} onChange={setMode} />
            </div>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
            placeholder={
              mode === "latex"
                ? "e.g. Write an academic paper on the impact of LLMs on software engineering…"
                : "e.g. Research the top AI tools of 2025 and write a comparison note…"
            }
            rows={3}
            disabled={isActive || isSynthesizing}
            className="w-full resize-none bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-zinc-600">⌘ + Enter to run</span>
            <div className="flex gap-2">
              {(phase === "done" || phase === "error") && (
                <button
                  onClick={reset}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                >
                  New task
                </button>
              )}
              <button
                onClick={run}
                disabled={!prompt.trim() || isActive || isSynthesizing}
                className="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isActive ? "Running…" : isSynthesizing ? "Synthesising…" : "Launch agents →"}
              </button>
            </div>
          </div>
        </div>

        {phase === "idle" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES[mode].map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Spawning indicator ────────────────────────────────────────────── */}
      {phase === "spawning" && (
        <div className="mb-6 flex items-center gap-2 text-sm text-zinc-400">
          <span className="inline-flex gap-1">
            <span className="animate-bounce">·</span>
            <span className="animate-bounce [animation-delay:75ms]">·</span>
            <span className="animate-bounce [animation-delay:150ms]">·</span>
          </span>
          Planning your agent team…
        </div>
      )}

      {/* ── Pending approvals ─────────────────────────────────────────────── */}
      <PendingApprovals active={approvalsActive} />

      {/* ── Agent cards ───────────────────────────────────────────────────── */}
      {agents.length > 0 && (isActive || isSynthesizing || phase === "done") && (
        <div className="mb-6">
          {(isActive || isSynthesizing) && (
            <>
              <div
                className={`grid gap-2 ${
                  agents.length === 1
                    ? "grid-cols-1"
                    : agents.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3"
                }`}
              >
                {agents.map((a) => (
                  <AgentCard key={a.id} agent={a} />
                ))}
              </div>

              {isActive && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-zinc-600">
                    <span>
                      {doneCount + failedCount}/{agents.length} agents done
                    </span>
                    <span>
                      {Math.round(
                        ((doneCount + failedCount) / agents.length) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-0.5 w-full rounded-full bg-zinc-800">
                    <div
                      className="h-0.5 rounded-full bg-blue-500 transition-all duration-500"
                      style={{
                        width: `${
                          ((doneCount + failedCount) / agents.length) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {isSynthesizing && (
                <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                  <span className="inline-flex gap-0.5">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce [animation-delay:75ms]">·</span>
                    <span className="animate-bounce [animation-delay:150ms]">·</span>
                  </span>
                  {isLatexRun ? "Composing LaTeX paper…" : "Synthesising answer…"}
                </div>
              )}
            </>
          )}

          {phase === "done" && (
            <button
              onClick={() => setShowAgentDetails((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-left transition-colors hover:border-zinc-700"
            >
              <span className="text-xs text-zinc-400">
                <span className="font-medium text-zinc-300">
                  {agents.length} agent{agents.length !== 1 ? "s" : ""}
                </span>
                {" · "}
                {totalSteps} steps
                {failedCount > 0 && ` · ${failedCount} failed`}
              </span>
              <span className="text-xs text-zinc-500">
                {showAgentDetails ? "Hide details ↑" : "Show agent details ↓"}
              </span>
            </button>
          )}

          {phase === "done" && showAgentDetails && (
            <div className="mt-2 space-y-2">
              {plan && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                    Plan
                  </p>
                  <p className="text-xs leading-relaxed text-zinc-400">{plan}</p>
                </div>
              )}
              <div
                className={`grid gap-2 ${
                  agents.length === 1
                    ? "grid-cols-1"
                    : agents.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3"
                }`}
              >
                {agents.map((a) => (
                  <AgentCard key={a.id} agent={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Answer / LaTeX panel ──────────────────────────────────────────── */}
      {synthesis && (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base">{isLatexRun ? "📐" : "✨"}</span>
              <p className="text-sm font-semibold text-white">
                {isLatexRun ? "LaTeX Paper" : "Answer"}
              </p>
              {!synthesisDone && (
                <span className="flex items-center gap-0.5 text-xs text-zinc-500">
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce [animation-delay:75ms]">·</span>
                  <span className="animate-bounce [animation-delay:150ms]">·</span>
                </span>
              )}
            </div>
            {synthesisDone && (
              <div className="flex gap-2">
                {isLatexRun && (
                  <button
                    onClick={() => openInOverleaf(synthesis)}
                    className="rounded-md border border-blue-900 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-900/40 hover:text-blue-300"
                  >
                    ↗ Preview PDF
                  </button>
                )}
                <button
                  onClick={downloadAnswer}
                  className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
                >
                  ↓ {isLatexRun ? "Download .tex" : "Download .md"}
                </button>
                <CopyButton text={synthesis} />
              </div>
            )}
          </div>

          <div className="px-5 py-5">
            {isLatexRun ? (
              <LaTeXViewer text={synthesis} streaming={!synthesisDone} />
            ) : synthesisDone ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
                {synthesis}
              </ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {synthesis}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Done bar ──────────────────────────────────────────────────────── */}
      {phase === "done" && synthesis && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-xs text-zinc-500">
            {doneCount} agent{doneCount !== 1 ? "s" : ""} · {totalSteps} steps
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-100"
          >
            New task →
          </button>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {phase === "error" && errorMessage && (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4">
          <p className="text-sm font-medium text-red-400">Something went wrong</p>
          <p className="mt-1 text-xs text-red-400/80">{errorMessage}</p>
        </div>
      )}

      {/* ── Past reports ──────────────────────────────────────────────────── */}
      {reports.length > 0 && phase === "idle" && (
        <div className="mt-12">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
            Past reports
          </h2>
          <div className="space-y-2">
            {reports.map((r) => (
              <ReportItem key={r.id} report={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
