-- UP
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS sync_pending boolean NOT NULL DEFAULT false;
