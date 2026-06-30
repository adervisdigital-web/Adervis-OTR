-- VK mini-brief state tracking
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vk_brief_step INT;

-- VK brief answers storage (business, name, contact)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vk_brief_data JSONB DEFAULT '{}'::jsonb;
