-- supabase/migrations/20260616000000_playbook.sql

-- Add playbook_step to leads (NULL = not in playbook, 1 = step 1 is current, etc.)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS playbook_step INTEGER DEFAULT NULL;

-- Add playbook_config to workspace_settings (JSONB config with steps array)
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS playbook_config JSONB DEFAULT NULL;
