CREATE TABLE IF NOT EXISTS user_bots (
  job_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  created_at_ms BIGINT NOT NULL,
  INDEX idx_user_bots_user_created (user_id, created_at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
