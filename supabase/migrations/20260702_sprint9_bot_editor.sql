-- Sprint 9: editable bot texts (portfolio, brief questions, AI prompt)
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_portfolio_text  TEXT,
  ADD COLUMN IF NOT EXISTS tg_brief_questions JSONB,
  ADD COLUMN IF NOT EXISTS tg_ai_prompt       TEXT;
