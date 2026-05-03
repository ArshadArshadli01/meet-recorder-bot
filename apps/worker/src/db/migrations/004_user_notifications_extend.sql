ALTER TABLE user_notifications
  ADD COLUMN is_read TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN kind VARCHAR(32) NOT NULL DEFAULT 'system',
  ADD COLUMN data_json JSON NULL,
  ADD COLUMN bot_id VARCHAR(64) NULL,
  ADD INDEX idx_user_unread (user_id, is_read, created_at_ms),
  ADD INDEX idx_user_created (user_id, created_at_ms);
