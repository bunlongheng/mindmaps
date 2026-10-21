-- A passcode on a shared map, like a Stickies private share. NULL = no passcode.
-- passcode_hash is the scrypt hash the lock screen verifies against
-- (api/_lib/passcode.ts); a visitor without the unlock cookie gets the lock
-- screen instead of the map. passcode_enc is the same passcode AES-256-GCM
-- sealed under MINDMAP_JWT_SECRET, opened only for the owner's own Passcode box.
-- Additive only: the DB is shared with production.

ALTER TABLE mindmaps ADD COLUMN IF NOT EXISTS passcode_hash text;
ALTER TABLE mindmaps ADD COLUMN IF NOT EXISTS passcode_enc text;
