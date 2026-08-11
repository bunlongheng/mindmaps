-- Add is_favorite column to persist favorites across devices and sessions
ALTER TABLE mindmaps ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
