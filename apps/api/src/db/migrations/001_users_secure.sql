CREATE TABLE IF NOT EXISTS users_secure (
  id VARCHAR(191) PRIMARY KEY,
  email_enc TEXT NOT NULL,
  name_enc TEXT NULL,
  picture_enc TEXT NULL,
  refresh_token_enc TEXT NULL,
  created_at_ms BIGINT NOT NULL,
  last_login_ms BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
