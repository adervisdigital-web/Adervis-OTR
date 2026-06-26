-- Sprint 3: reminders + service category
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tg_reminded_at   BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS service_category TEXT   DEFAULT NULL;

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_reminder_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tg_reminder_text    TEXT    DEFAULT NULL;
