CREATE TABLE IF NOT EXISTS user_record_form_defaults (
  user_id VARCHAR(191) PRIMARY KEY,
  meeting_url TEXT NULL,
  bot_name VARCHAR(80) NOT NULL DEFAULT 'Meet Bot',
  save_to_drive TINYINT(1) NOT NULL DEFAULT 1,
  save_to_spaces TINYINT(1) NOT NULL DEFAULT 0,
  drive_folder_id VARCHAR(512) NULL,
  updated_at_ms BIGINT NOT NULL,
  INDEX idx_record_defaults_updated (updated_at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
