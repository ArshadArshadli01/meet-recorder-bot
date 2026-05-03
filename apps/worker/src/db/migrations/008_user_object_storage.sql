CREATE TABLE IF NOT EXISTS user_object_storage (
  user_id VARCHAR(191) NOT NULL PRIMARY KEY,
  credentials_enc TEXT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  INDEX idx_user_object_storage_updated (updated_at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
