-- VK Auto-reply: welcome text sent on first incoming message
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS vk_welcome_text TEXT;
