-- ADERVIS OTR — Supabase Schema
-- Запустить в Supabase Dashboard → SQL Editor

-- Workspaces (команды)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Члены workspace
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  role TEXT DEFAULT 'manager',
  PRIMARY KEY (workspace_id, user_id)
);

-- Лиды
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  link TEXT,
  contact TEXT,
  biz_type TEXT,
  status INTEGER DEFAULT 0,
  updated_at BIGINT,
  notes TEXT,
  messages JSONB DEFAULT '[]',
  remind_at TEXT,
  attempt_count INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Скрипты (per workspace, per stage)
CREATE TABLE scripts (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  templates JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (workspace_id, stage)
);

-- CTA ссылки (per workspace)
CREATE TABLE cta_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  call_link TEXT DEFAULT '',
  brief_link TEXT DEFAULT '',
  meeting_link TEXT DEFAULT ''
);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cta_config        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_own" ON workspaces
  FOR ALL USING (id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "members_own" ON workspace_members
  FOR ALL USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "leads_workspace" ON leads
  FOR ALL USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "scripts_workspace" ON scripts
  FOR ALL USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "cta_workspace" ON cta_config
  FOR ALL USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- ── Realtime ─────────────────────────────────────────────────────
-- Включить таблицу leads в Realtime публикацию
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
