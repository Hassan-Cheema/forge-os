"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { StreamEvent, AgentMeta, AgentResult } from "@/app/api/agents/run/route";
import type { Report } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "spawning" | "running" | "synthesizing" | "done" | "error";
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

interface ChatMessage {
  id: string;
  prompt: string;
  mode: Mode;
  phase: Phase;
  plan: string | null;
  agents: AgentState[];
  synthesis: string;
  synthesisDone: boolean;
  errorMessage: string | null;
}

// ─── LaTeX → HTML renderer ───────────────────────────────────────────────────

/** Preserve math spans before other processing so regexes don't corrupt them */
function protectMath(text: string): { protected: string; restore: (s: string) => string } {
  const slots: string[] = [];
  let out = text;
  // Display math \[...\]
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => { slots.push(`\\[${m}\\]`); return `@@MATH${slots.length - 1}@@`; });
  // Display math $$...$$
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => { slots.push(`$$${m}$$`); return `@@MATH${slots.length - 1}@@`; });
  // Inline math $...$
  out = out.replace(/\$([^$\n]+?)\$/g, (_, m) => { slots.push(`$${m}$`); return `@@MATH${slots.length - 1}@@`; });
  return {
    protected: out,
    restore: (s: string) => s.replace(/@@MATH(\d+)@@/g, (_, i) => slots[Number(i)] ?? ""),
  };
}

function fmt(text: string): string {
  // Escaped special chars → safe HTML equivalents
  let t = text
    .replace(/\\&/g, "&amp;")
    .replace(/\\%/g, "%")
    .replace(/\\\$/g, "&#36;")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\\^{}/g, "^")
    .replace(/\\\^/g, "^")
    .replace(/\\{/g, "{")
    .replace(/\\}/g, "}");

  // Inline formatting
  t = t
    .replace(/\\textbf\{([^{}]+)\}/g, "<strong>$1</strong>")
    .replace(/\\textit\{([^{}]+)\}/g, "<em>$1</em>")
    .replace(/\\emph\{([^{}]+)\}/g, "<em>$1</em>")
    .replace(/\\texttt\{([^{}]+)\}/g, "<code>$1</code>")
    .replace(/\\underline\{([^{}]+)\}/g, "<u>$1</u>")
    .replace(/\\url\{([^{}]+)\}/g, '<a href="$1">$1</a>')
    .replace(/\\href\{([^{}]+)\}\{([^{}]+)\}/g, '<a href="$1">$2</a>');

  // Remove known no-output commands
  t = t
    .replace(/\\cite\{[^{}]+\}/g, "")
    .replace(/\\ref\{[^{}]+\}/g, "")
    .replace(/\\label\{[^{}]+\}/g, "")
    .replace(/\\footnote\{[^{}]+\}/g, "")
    .replace(/\\vspace\*?\{[^{}]+\}/g, "")
    .replace(/\\hspace\*?\{[^{}]+\}/g, " ")
    .replace(/\\hline\b/g, "")
    .replace(/\\noindent\b/g, "")
    .replace(/\\par\b/g, "\n\n")
    .replace(/\\newpage\b/g, '<hr class="pb">');

  // Line breaks
  t = t.replace(/\\\\\s*/g, "<br>");

  // Strip any remaining unknown commands with arguments
  t = t.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])*(?:\{[^{}]*\})*/g, " ");
  // Strip leftover bare braces
  t = t.replace(/\{([^{}]*)\}/g, "$1");

  // Tilde (non-breaking space)
  t = t.replace(/~/g, " ");

  return t.replace(/ {2,}/g, " ").trim();
}

function latexToHtml(source: string): string {
  // Protect math before any processing
  const { protected: safe, restore } = protectMath(source);

  const title = safe.match(/\\title\{([\s\S]*?)\}/)?.[1]?.trim() ?? "Document";
  const author = safe.match(/\\author\{([\s\S]*?)\}/)?.[1]?.trim() ?? "Anonymous";
  const rawDate = safe.match(/\\date\{([\s\S]*?)\}/)?.[1]?.trim() ?? "";
  const date =
    !rawDate || rawDate === "\\today"
      ? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : fmt(rawDate);

  // Extract body
  const bodyMatch = safe.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  let body = bodyMatch ? bodyMatch[1] : safe;

  body = body.replace(/\\maketitle/g, "");

  // Abstract
  body = body.replace(
    /\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g,
    (_, c) => `<div class="abstract"><p class="abtitle">Abstract</p><p>${fmt(c.trim())}</p></div>`
  );

  // Sections
  body = body.replace(/\\section\*?\{([\s\S]*?)\}/g, (_, t) => `\n<h2>${fmt(t)}</h2>\n`);
  body = body.replace(/\\subsection\*?\{([\s\S]*?)\}/g, (_, t) => `\n<h3>${fmt(t)}</h3>\n`);
  body = body.replace(/\\subsubsection\*?\{([\s\S]*?)\}/g, (_, t) => `\n<h4>${fmt(t)}</h4>\n`);

  // Lists
  body = body.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, c) => {
    const items = c.split("\\item").slice(1).map((i: string) => `<li>${fmt(i.trim())}</li>`).join("");
    return `\n<ul>${items}</ul>\n`;
  });
  body = body.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, c) => {
    const items = c.split("\\item").slice(1).map((i: string) => `<li>${fmt(i.trim())}</li>`).join("");
    return `\n<ol>${items}</ol>\n`;
  });

  // Remove any remaining environments we can't render
  body = body.replace(/\\begin\{(?:table|tabular|figure|wrapfigure|verbatim)\*?\}[\s\S]*?\\end\{(?:table|tabular|figure|wrapfigure|verbatim)\*?\}/g, "");

  // Bibliography
  body = body.replace(
    /\\begin\{thebibliography\}\{[^}]*\}([\s\S]*?)\\end\{thebibliography\}/g,
    (_, c) => {
      const refs = c
        .split(/\\bibitem(?:\[[^\]]*\])?\{[^}]*\}/)
        .slice(1)
        .map((item: string) => `<li>${fmt(item.trim())}</li>`)
        .join("");
      return refs ? `\n<h2>References</h2>\n<ol class="refs">${refs}</ol>\n` : "";
    }
  );

  // Apply fmt to remaining body text
  body = fmt(body);

  // Restore math placeholders
  body = restore(body);

  // Convert double newlines → paragraphs
  body = body
    .split(/\n{2,}/)
    .map((p: string) => {
      p = p.trim();
      if (!p) return "";
      if (/^<(h[1-6]|ul|ol|div|ol|hr)/.test(p)) return p;
      return `<p>${p.replace(/\n/g, " ")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  const headerHtml = `<div class="doc-header">
    <h1>${restore(fmt(title))}</h1>
    <p class="author">${restore(fmt(author))}</p>
    ${date ? `<p class="date">${date}</p>` : ""}
  </div>`;

  return headerHtml + "\n" + body;
}

function buildPreviewHtml(source: string): string {
  const content = latexToHtml(source);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview</title>
<script>MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]]}};<\/script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;color:#111;font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.8;max-width:760px;margin:0 auto;padding:2.5rem 3rem}
.doc-header{text-align:center;padding-bottom:1.5rem;margin-bottom:2rem;border-bottom:1px solid #ccc}
.doc-header h1{font-size:1.5rem;font-weight:bold;margin-bottom:.4rem;line-height:1.3}
.author{font-size:.95rem;color:#444;margin-top:.2rem}
.date{font-size:.85rem;color:#666;margin-top:.15rem}
h2{font-size:1.05rem;font-weight:bold;margin:1.8rem 0 .5rem}
h3{font-size:1rem;font-weight:bold;font-style:italic;margin:1.4rem 0 .4rem}
h4{font-size:.95rem;font-weight:bold;margin:1.1rem 0 .3rem}
p{margin-bottom:.75rem;text-align:justify}
.abstract{background:#f7f7f7;border:1px solid #e0e0e0;padding:.9rem 1.1rem;margin:1.5rem 0;border-radius:3px}
.abtitle{font-weight:bold;text-align:center;font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem!important}
ul,ol{margin:.4rem 0 .7rem 1.4rem}
li{margin-bottom:.25rem}
.refs li{font-size:.9rem;margin-bottom:.4rem}
code{font-family:monospace;background:#f0f0f0;padding:.1em .3em;border-radius:2px;font-size:.88em}
a{color:#1a0dab}
hr.pb{border:none;border-top:1px dashed #bbb;margin:1.5rem 0}
@media print{body{padding:0;max-width:none}.no-print{display:none!important}}
</style>
</head>
<body>${content}</body>
</html>`;
}

// ─── Markdown theme ───────────────────────────────────────────────────────────

const md: Components = {
  h1: ({ children }) => <h1 className="mb-3 mt-6 text-lg font-bold text-white first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-bold text-white first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-100 first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-3 text-sm leading-relaxed text-zinc-300 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 space-y-1 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => (
    <li className="flex gap-2 text-sm leading-relaxed text-zinc-300">
      <span className="mt-0.5 shrink-0 text-zinc-600">•</span>
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-400">{children}</em>,
  hr: () => <hr className="my-5 border-zinc-800" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-zinc-700 pl-4 italic text-zinc-400">{children}</blockquote>
  ),
  code: ({ className, children }) =>
    className?.startsWith("language-") ? (
      <code className="block overflow-x-auto rounded-lg bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-200">{children}</code>
    ) : (
      <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-200">{children}</code>
    ),
  pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg bg-zinc-950 p-0">{children}</pre>,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-zinc-800/60">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-zinc-800/60">{children}</tbody>,
  tr: ({ children }) => <tr className="transition-colors hover:bg-zinc-800/30">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2.5 text-left font-semibold text-zinc-200">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2.5 text-zinc-300">{children}</td>,
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function groupByDate(reports: Report[]) {
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const DAY = 86_400_000;
  const buckets: { label: string; items: Report[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const r of reports) {
    const t = new Date(r.created_at).getTime();
    if (t >= todayStart) buckets[0].items.push(r);
    else if (t >= todayStart - DAY) buckets[1].items.push(r);
    else if (t >= todayStart - 7 * DAY) buckets[2].items.push(r);
    else buckets[3].items.push(r);
  }
  return buckets.filter((b) => b.items.length > 0);
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── StatusDot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: AgentState["status"] }) {
  if (status === "waiting") return <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />;
  if (status === "running")
    return (
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
    );
  if (status === "done") return <span className="inline-block h-2 w-2 rounded-full bg-green-500" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-red-500" />;
}

// ─── AgentCard ────────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentState }) {
  const border = { waiting: "border-zinc-800", running: "border-blue-900", done: "border-green-900", failed: "border-red-900" }[agent.status];
  const bg = { waiting: "bg-zinc-900/40", running: "bg-blue-950/30", done: "bg-green-950/20", failed: "bg-red-950/30" }[agent.status];
  return (
    <div className={`rounded-lg border ${border} ${bg} px-3 py-2.5 transition-all duration-300`}>
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{agent.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">{agent.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <StatusDot status={agent.status} />
            <span className="text-[10px] capitalize text-zinc-500">{agent.status}</span>
            {agent.result && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-[10px] text-zinc-500">{agent.result.stepsExecuted}s</span>
              </>
            )}
          </div>
        </div>
      </div>
      {agent.status === "running" && (
        <div className="mt-2 space-y-1">
          <div className="h-0.5 animate-pulse rounded-full bg-zinc-800" />
          <div className="h-0.5 w-2/3 animate-pulse rounded-full bg-zinc-800" />
        </div>
      )}
      {agent.status === "failed" && agent.errorMessage && (
        <p className="mt-1 text-[10px] text-red-400">{agent.errorMessage}</p>
      )}
    </div>
  );
}

// ─── LaTeXViewer ─────────────────────────────────────────────────────────────

function LaTeXViewer({ text, streaming, onDownload }: { text: string; streaming: boolean; onDownload?: () => void }) {
  const [tab, setTab] = useState<"source" | "preview">("source");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Clean up blob URL on unmount or when it changes
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  function openPreview() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    const blob = new Blob([buildPreviewHtml(text)], { type: "text/html" });
    setBlobUrl(URL.createObjectURL(blob));
    setTab("preview");
  }

  function showSource() {
    setTab("source");
  }

  function printPdf() {
    const w = window.open("about:blank", "_blank");
    if (!w) return;
    w.document.write(buildPreviewHtml(text));
    w.document.close();
    w.onload = () => { w.print(); };
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-800 px-1">
        <button
          onClick={showSource}
          className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
            tab === "source" ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          LaTeX
        </button>
        <button
          onClick={openPreview}
          disabled={streaming || !text}
          className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
            tab === "preview" ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
          } disabled:opacity-40`}
        >
          Preview
        </button>
        <div className="ml-auto flex items-center gap-1.5 pr-3">
          {tab === "preview" && blobUrl && (
            <button
              onClick={printPdf}
              className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
            >
              ↓ Save as PDF
            </button>
          )}
          {onDownload && (
            <button
              onClick={onDownload}
              className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
            >
              ↓ .tex
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {tab === "preview" && blobUrl ? (
        <iframe
          ref={iframeRef}
          src={blobUrl}
          className="w-full bg-white"
          style={{ height: "640px" }}
          sandbox="allow-scripts"
          title="LaTeX Preview"
        />
      ) : (
        <div className="relative overflow-x-auto px-5 py-4">
          {streaming && (
            <span className="absolute right-3 top-3 flex items-center gap-0.5 text-xs text-zinc-600">
              <span className="animate-bounce">·</span>
              <span className="animate-bounce [animation-delay:75ms]">·</span>
              <span className="animate-bounce [animation-delay:150ms]">·</span>
            </span>
          )}
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-300">{text}</pre>
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
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
      style={{ color: copied ? "#4ade80" : undefined }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ─── PendingApprovals ─────────────────────────────────────────────────────────

function PendingApprovals({ active }: { active: boolean }) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!active) { setApprovals([]); return; }
    async function poll() {
      const res = await fetch("/api/agents/approvals");
      if (res.ok) setApprovals((await res.json()).approvals ?? []);
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [active]);

  async function resolve(id: string, action: "approve" | "reject") {
    setResolving((p) => new Set(p).add(id));
    await fetch("/api/agents/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setApprovals((p) => p.filter((a) => a.id !== id));
    setResolving((p) => { const n = new Set(p); n.delete(id); return n; });
  }

  if (!approvals.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-yellow-900/60 bg-yellow-950/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-yellow-600">
          Pending approvals ({approvals.length})
        </p>
      </div>
      <div className="space-y-2">
        {approvals.map((a) => (
          <div key={a.id} className="rounded-lg border border-yellow-900/40 bg-yellow-950/30 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 font-mono text-[10px] text-yellow-400">{a.tool_name}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{a.category}</span>
                  <span className="text-[10px] font-medium text-yellow-700">risk {a.risk_score}/10</span>
                </div>
                {a.description && <p className="mt-1 text-xs text-zinc-300">{a.description}</p>}
                {a.risk_reason && <p className="mt-0.5 text-[10px] italic text-zinc-500">{a.risk_reason}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => resolve(a.id, "approve")} disabled={resolving.has(a.id)} className="rounded border border-green-800 bg-green-950/40 px-2 py-0.5 text-[11px] font-medium text-green-400 hover:bg-green-900/40 disabled:opacity-40">Approve</button>
                <button onClick={() => resolve(a.id, "reject")} disabled={resolving.has(a.id)} className="rounded border border-red-900 bg-red-950/40 px-2 py-0.5 text-[11px] font-medium text-red-400 hover:bg-red-900/40 disabled:opacity-40">Reject</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MessageThread ────────────────────────────────────────────────────────────

function MessageThread({ msg }: { msg: ChatMessage }) {
  const [showAgents, setShowAgents] = useState(false);
  const isLatex = msg.mode === "latex";
  const isRunning = msg.phase === "running" || msg.phase === "spawning";
  const isSynth = msg.phase === "synthesizing";
  const isDone = msg.phase === "done";
  const doneCount = msg.agents.filter((a) => a.status === "done").length;
  const failedCount = msg.agents.filter((a) => a.status === "failed").length;
  const totalSteps = msg.agents.reduce((s, a) => s + (a.result?.stepsExecuted ?? 0), 0);

  function downloadSynthesis() {
    const ext = isLatex ? "tex" : "md";
    const mime = isLatex ? "application/x-tex" : "text/markdown";
    const blob = new Blob([msg.synthesis], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `result.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="max-w-lg rounded-2xl rounded-br-sm bg-zinc-800 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">{isLatex ? "📐 LaTeX" : "📄 Research"}</span>
          </div>
          <p className="text-sm text-white">{msg.prompt}</p>
        </div>
      </div>

      {/* AI response */}
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-sm">
          ⚙
        </div>
        <div className="flex-1 min-w-0">
          {/* Spawning */}
          {msg.phase === "spawning" && (
            <p className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce">·</span>
                <span className="animate-bounce [animation-delay:75ms]">·</span>
                <span className="animate-bounce [animation-delay:150ms]">·</span>
              </span>
              Planning your agent team…
            </p>
          )}

          {/* Pending approvals */}
          <PendingApprovals active={isRunning || isSynth} />

          {/* Agent cards (while running) */}
          {msg.agents.length > 0 && (isRunning || isSynth) && (
            <div className="mb-4">
              <div className={`grid gap-2 ${msg.agents.length === 1 ? "grid-cols-1" : msg.agents.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
                {msg.agents.map((a) => <AgentCard key={a.id} agent={a} />)}
              </div>
              {isRunning && msg.agents.length > 0 && (
                <div className="mt-2.5">
                  <div className="mb-1 flex justify-between text-[10px] text-zinc-600">
                    <span>{doneCount + failedCount}/{msg.agents.length} agents</span>
                    <span>{Math.round(((doneCount + failedCount) / msg.agents.length) * 100)}%</span>
                  </div>
                  <div className="h-0.5 w-full rounded-full bg-zinc-800">
                    <div
                      className="h-0.5 rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${((doneCount + failedCount) / msg.agents.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {isSynth && (
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <span className="inline-flex gap-0.5">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce [animation-delay:75ms]">·</span>
                    <span className="animate-bounce [animation-delay:150ms]">·</span>
                  </span>
                  {isLatex ? "Composing LaTeX paper…" : "Synthesising answer…"}
                </div>
              )}
            </div>
          )}

          {/* Done: collapsible agent summary */}
          {isDone && msg.agents.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowAgents((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
              >
                <span>{msg.agents.length} agents · {totalSteps} steps{failedCount > 0 ? ` · ${failedCount} failed` : ""}</span>
                <span>{showAgents ? "▲" : "▼"}</span>
              </button>
              {showAgents && (
                <div className={`mt-2 grid gap-2 ${msg.agents.length === 1 ? "grid-cols-1" : msg.agents.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
                  {msg.agents.map((a) => <AgentCard key={a.id} agent={a} />)}
                </div>
              )}
            </div>
          )}

          {/* Synthesis / answer */}
          {msg.synthesis && (
            <div>
              {isLatex ? (
                <LaTeXViewer
                  text={msg.synthesis}
                  streaming={!msg.synthesisDone}
                  onDownload={msg.synthesisDone ? downloadSynthesis : undefined}
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">✨</span>
                      <p className="text-xs font-semibold text-white">Answer</p>
                      {!msg.synthesisDone && (
                        <span className="flex gap-0.5 text-xs text-zinc-500">
                          <span className="animate-bounce">·</span>
                          <span className="animate-bounce [animation-delay:75ms]">·</span>
                          <span className="animate-bounce [animation-delay:150ms]">·</span>
                        </span>
                      )}
                    </div>
                    {msg.synthesisDone && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={downloadSynthesis}
                          className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
                        >
                          ↓ .md
                        </button>
                        <CopyButton text={msg.synthesis} />
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-5">
                    {msg.synthesisDone ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{msg.synthesis}</ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{msg.synthesis}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {msg.phase === "error" && msg.errorMessage && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3">
              <p className="text-sm font-medium text-red-400">Something went wrong</p>
              <p className="mt-1 text-xs text-red-400/80">{msg.errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ReportView (viewing a past report) ───────────────────────────────────────

function ReportView({ report }: { report: Report }) {
  const isLatex = report.type === "latex";

  function download() {
    const ext = isLatex ? "tex" : "md";
    const mime = isLatex ? "application/x-tex" : "text/markdown";
    const blob = new Blob([report.content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="max-w-lg rounded-2xl rounded-br-sm bg-zinc-800 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">{isLatex ? "📐 LaTeX" : "📄 Research"}</span>
            <span className="text-[10px] text-zinc-600">· {fmtTime(report.created_at)}</span>
          </div>
          <p className="text-sm text-white">{report.prompt}</p>
        </div>
      </div>

      {/* AI response */}
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-sm">
          ⚙
        </div>
        <div className="flex-1 min-w-0">
          {isLatex ? (
            <LaTeXViewer text={report.content} streaming={false} onDownload={download} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">✨</span>
                  <p className="text-xs font-semibold text-white">Answer</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={download} className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white">↓ .md</button>
                  <CopyButton text={report.content} />
                </div>
              </div>
              <div className="px-5 py-5">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{report.content}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

const EXAMPLES: Record<Mode, string[]> = {
  research: [
    "Compare the top 5 AI coding assistants in 2025 — pricing, features, and limitations",
    "Summarise the latest breakthroughs in quantum computing and their practical impact",
    "Research the current state of autonomous vehicles and which companies lead",
    "Analyse the economic impact of generative AI on creative industries",
  ],
  latex: [
    "Write an academic paper on the societal impact of large language models",
    "Produce a research paper on advances in renewable energy storage technology",
    "Write a paper on the future of autonomous systems in healthcare",
    "Survey recent progress in protein folding and its implications for drug discovery",
  ],
};

function WelcomeScreen({ mode, onExample }: { mode: Mode; onExample: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.07] text-2xl">⚙</div>
      <h2 className="text-xl font-semibold text-white">What should your agents do?</h2>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">
        Describe any task — forge-os breaks it into a parallel team of agents and delivers one clean answer.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {EXAMPLES[mode].map((ex) => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            className="rounded-full border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-left text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  reports,
  activeId,
  onSelect,
  onNewChat,
  userEmail,
  signOut,
}: {
  reports: Report[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  userEmail: string;
  signOut: () => Promise<void>;
}) {
  const groups = groupByDate(reports);
  return (
    <aside className="flex h-full flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center px-4 py-4">
        <span className="text-sm font-bold tracking-tight text-white">forge-os</span>
      </div>

      {/* New chat */}
      <div className="px-3 pb-2">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2.5 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          New chat
        </button>
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {groups.length === 0 && (
          <p className="px-3 py-4 text-xs text-zinc-600">No chats yet</p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{g.label}</p>
            {g.items.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeId === r.id ? "bg-white/[0.09] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <p className="truncate text-[13px]">{r.prompt}</p>
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  {r.type === "latex" ? "📐" : "📄"} {fmtTime(r.created_at)}
                </p>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-zinc-500">{userEmail}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="shrink-0 text-xs text-zinc-600 transition-colors hover:text-zinc-300">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentRunner({
  userId,
  userEmail,
  reports: initialReports,
  signOut,
}: {
  userId: string;
  userEmail: string;
  reports: Report[];
  signOut: () => Promise<void>;
}) {
  void userId;
  const router = useRouter();

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reports, setReports] = useState<Report[]>(initialReports);

  // Navigation: null = active session, string = viewing a past report
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Current session messages (multiple runs)
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Input
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("research");

  // File attachment
  const [attachment, setAttachment] = useState<{ name: string; text: string; chars: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning = messages.some(
    (m) => m.phase === "spawning" || m.phase === "running" || m.phase === "synthesizing"
  );
  const runningMsgId = messages.find(
    (m) => m.phase === "spawning" || m.phase === "running" || m.phase === "synthesizing"
  )?.id ?? null;

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateMsg = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const updateAgent = useCallback((msgId: string, agentId: string, patch: Partial<AgentState>) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, agents: m.agents.map((a) => (a.id === agentId ? { ...a, ...patch } : a)) } : m
      )
    );
  }, []);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-text", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error ?? "Upload failed."); return; }
      setAttachment({ name: json.filename, text: json.text, chars: json.chars });
      if (json.wasTruncated) setUploadError(`File truncated to 60,000 characters for processing.`);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRun() {
    if (!prompt.trim() || isRunning) return;

    const msgId = crypto.randomUUID();
    const runMode = mode;
    const runPrompt = prompt.trim();
    const endpoint = runMode === "latex" ? "/api/agents/latex" : "/api/agents/run";

    // Add message to session and switch to session view
    setMessages((prev) => [
      ...prev,
      {
        id: msgId,
        prompt: runPrompt,
        mode: runMode,
        phase: "spawning",
        plan: null,
        agents: [],
        synthesis: "",
        synthesisDone: false,
        errorMessage: null,
      },
    ]);
    setViewingId(null);
    setPrompt("");
    const runMaterial = attachment;
    setAttachment(null);
    setUploadError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: runPrompt, materialText: runMaterial?.text ?? "" }),
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
          try { event = JSON.parse(trimmed); } catch { continue; }

          if (event.type === "plan") {
            updateMsg(msgId, {
              plan: event.data.plan,
              phase: "running",
              agents: event.data.agents.map((a: AgentMeta) => ({ ...a, status: "waiting" as const })),
            });
          } else if (event.type === "agent_start") {
            updateAgent(msgId, event.data.id, { status: "running" });
          } else if (event.type === "agent_done") {
            updateAgent(msgId, event.data.id, { status: "done", result: event.data.result });
          } else if (event.type === "agent_error") {
            updateAgent(msgId, event.data.id, { status: "failed", errorMessage: event.data.message });
          } else if (event.type === "synthesis_start") {
            updateMsg(msgId, { phase: "synthesizing" });
          } else if (event.type === "synthesis_chunk") {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, synthesis: m.synthesis + event.data.text } : m))
            );
          } else if (event.type === "synthesis_done") {
            updateMsg(msgId, { synthesisDone: true });
          } else if (event.type === "complete") {
            updateMsg(msgId, { phase: "done" });
          } else if (event.type === "error") {
            updateMsg(msgId, { phase: "error", errorMessage: event.data.message });
          }
        }
      }

      updateMsg(msgId, { phase: "done" });
      router.refresh();
      // Refresh reports list after a short delay
      setTimeout(() => {
        setReports((prev) => prev); // trigger re-render; router.refresh handles DB sync
      }, 500);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        updateMsg(msgId, { phase: "error", errorMessage: "Cancelled." });
        return;
      }
      updateMsg(msgId, { phase: "error", errorMessage: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  function newChat() {
    abortRef.current?.abort();
    setViewingId(null);
    setMessages([]);
    setPrompt("");
    textareaRef.current?.focus();
  }

  const viewingReport = viewingId ? reports.find((r) => r.id === viewingId) ?? null : null;
  const showWelcome = !viewingId && messages.length === 0;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d0d0d] text-white">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div
        className={`shrink-0 transition-all duration-200 ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"} border-r border-white/[0.06]`}
      >
        <Sidebar
          reports={reports}
          activeId={viewingId}
          onSelect={(id) => { setViewingId(id); }}
          onNewChat={newChat}
          userEmail={userEmail}
          signOut={signOut}
        />
      </div>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            title="Toggle sidebar"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>

          <p className="truncate text-sm text-zinc-500">
            {viewingReport
              ? viewingReport.prompt.slice(0, 60) + (viewingReport.prompt.length > 60 ? "…" : "")
              : messages.length > 0
              ? messages[messages.length - 1].prompt.slice(0, 60) + "…"
              : "New chat"}
          </p>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto">
          {showWelcome ? (
            <WelcomeScreen mode={mode} onExample={(ex) => { setPrompt(ex); textareaRef.current?.focus(); }} />
          ) : viewingReport ? (
            <div className="mx-auto max-w-3xl px-4 py-8">
              <ReportView report={viewingReport} />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
              {messages.map((msg) => (
                <MessageThread key={msg.id} msg={msg} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Input bar ──────────────────────────────────────────────────── */}
        <div className="border-t border-white/[0.06] px-4 py-4">
          <div className="mx-auto max-w-3xl">

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.tex,.csv,.json"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Upload error */}
            {uploadError && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-yellow-900/60 bg-yellow-950/20 px-3 py-2">
                <span className="text-xs text-yellow-400">{uploadError}</span>
                <button onClick={() => setUploadError(null)} className="ml-auto text-xs text-zinc-500 hover:text-white">✕</button>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-900 focus-within:border-white/[0.2] transition-colors">

              {/* Attached file chip */}
              {attachment && (
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                  <div className="flex items-center gap-2 rounded-lg border border-blue-900/50 bg-blue-950/30 px-3 py-1.5">
                    <span className="text-sm">📚</span>
                    <div className="min-w-0">
                      <p className="max-w-[200px] truncate text-xs font-medium text-blue-300">{attachment.name}</p>
                      <p className="text-[10px] text-blue-500">{(attachment.chars / 1000).toFixed(1)}k chars · will be analyzed</p>
                    </div>
                    <button
                      onClick={() => { setAttachment(null); setUploadError(null); }}
                      className="ml-1 shrink-0 text-xs text-zinc-500 transition-colors hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun();
                }}
                placeholder={
                  attachment
                    ? "Describe what you want the agents to do with your material…"
                    : mode === "latex"
                    ? "Write an academic paper on…"
                    : "Research, compare, summarise anything…"
                }
                rows={3}
                disabled={isRunning}
                className="w-full resize-none bg-transparent px-4 pt-4 text-sm text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-2">
                  {/* Attach file button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isRunning || uploading}
                    title="Attach file (PDF, TXT, MD, TEX, CSV)"
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all disabled:opacity-40 ${
                      attachment
                        ? "border-blue-800 bg-blue-950/40 text-blue-400"
                        : "border-white/[0.07] text-zinc-500 hover:border-white/[0.15] hover:text-zinc-300"
                    }`}
                  >
                    {uploading ? (
                      <span className="flex gap-0.5">
                        <span className="animate-bounce text-[10px]">·</span>
                        <span className="animate-bounce text-[10px] [animation-delay:75ms]">·</span>
                        <span className="animate-bounce text-[10px] [animation-delay:150ms]">·</span>
                      </span>
                    ) : (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a1.5 1.5 0 0 0 2.122 2.121l7-7a.5.5 0 0 1 .707.708l-7 7a2.5 2.5 0 0 1-3.536-3.536l7-7a4.5 4.5 0 0 1 6.364 6.364l-7 7a6.5 6.5 0 0 1-9.192-9.193l7-7.001a.75.75 0 0 1 1.061 1.06l-7 7.001A5 5 0 0 0 8.96 16.55l7-7a3 3 0 0 0 0-4.243Z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span>{uploading ? "Reading…" : "Attach"}</span>
                  </button>

                  {/* Mode toggle */}
                  <div className="inline-flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
                    <button
                      onClick={() => setMode("research")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        mode === "research" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      📄 Research
                    </button>
                    <button
                      onClick={() => setMode("latex")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        mode === "latex" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      📐 LaTeX
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-zinc-600 sm:block">⌘ + Enter</span>
                  {isRunning ? (
                    <button
                      onClick={() => {
                        abortRef.current?.abort();
                        if (runningMsgId) updateMsg(runningMsgId, { phase: "error", errorMessage: "Cancelled." });
                      }}
                      className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-red-700 hover:text-red-400"
                    >
                      ✕ Stop
                    </button>
                  ) : (
                    <button
                      onClick={handleRun}
                      disabled={!prompt.trim()}
                      className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Launch →
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-zinc-700">
              Attach PDF, TXT, MD, TEX, or CSV · up to 10 MB · analyzed by a dedicated agent
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
