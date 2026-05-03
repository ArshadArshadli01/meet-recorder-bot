CREATE TABLE IF NOT EXISTS user_push_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  token_enc TEXT NOT NULL,
  user_agent VARCHAR(512) NULL,
  created_at_ms BIGINT NOT NULL,
  last_seen_ms BIGINT NOT NULL,
  UNIQUE KEY uniq_user_token (user_id(191), token_enc(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
