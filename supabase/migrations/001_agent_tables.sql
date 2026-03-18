-- ─────────────────────────────────────────────────────────────────────────────
-- forge-os: agent infrastructure tables
-- Run this once in your Supabase SQL editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- ─────────────────────────────────────────────────────────────────────────────


-- ── agents ───────────────────────────────────────────────────────────────────
-- One row per agent instance. Updated by BaseAgent.setStatus().

CREATE TABLE IF NOT EXISTS agents (
  id          UUID        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'idle'
                          CHECK (status IN ('idle', 'running', 'paused', 'error')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own agents"
  ON agents FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── actions ───────────────────────────────────────────────────────────────────
-- Audit log — every tool call decision (execute / queue / block) is recorded.

CREATE TABLE IF NOT EXISTS actions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id     UUID        NOT NULL,
  tool_name    TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  description  TEXT,
  input        JSONB,
  risk_score   INTEGER     NOT NULL CHECK (risk_score BETWEEN 1 AND 10),
  risk_reason  TEXT,
  decision     TEXT        NOT NULL CHECK (decision IN ('execute', 'queue', 'block')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own actions"
  ON actions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── pending_approvals ─────────────────────────────────────────────────────────
-- Actions scored above the user's risk limit land here for human review.

CREATE TABLE IF NOT EXISTS pending_approvals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id     UUID        NOT NULL,
  tool_name    TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  description  TEXT,
  input        JSONB,
  risk_score   INTEGER     NOT NULL CHECK (risk_score BETWEEN 1 AND 10),
  risk_reason  TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own approvals"
  ON pending_approvals FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS actions_user_id_idx        ON actions        (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS actions_agent_id_idx       ON actions        (agent_id);
CREATE INDEX IF NOT EXISTS pending_approvals_user_idx ON pending_approvals (user_id, status, created_at DESC);
