-- Persist additional Google profile fields. `avatar_url` is the public S3
-- URL we self-host (so the UI doesn't depend on Google's CDN, which gates
-- some `lh3.googleusercontent.com` URLs after a session is closed).
-- `google_picture_url_enc` is the original Google URL kept encrypted only so
-- we can detect when it changes and re-upload a fresh avatar.
-- `given_name_enc`, `family_name_enc`, `locale_enc` round out the profile.
ALTER TABLE users_secure
  ADD COLUMN avatar_url VARCHAR(1024) NULL,
  ADD COLUMN google_picture_url_enc TEXT NULL,
  ADD COLUMN avatar_updated_at_ms BIGINT NULL,
  ADD COLUMN given_name_enc TEXT NULL,
  ADD COLUMN family_name_enc TEXT NULL,
  ADD COLUMN locale_enc TEXT NULL;
