CREATE TABLE IF NOT EXISTS leaderboard_times (
  board_key TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  best_ms INTEGER NOT NULL CHECK (best_ms BETWEEN 1 AND 86400000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (board_key, player_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_times_ranking
ON leaderboard_times(board_key, best_ms ASC, updated_at ASC, player_id ASC);
