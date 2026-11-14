CREATE TABLE IF NOT EXISTS leaderboard_scores (
 board_key TEXT NOT NULL,
 player_id TEXT NOT NULL,
 player_name TEXT NOT NULL,
 best_score INTEGER NOT NULL CHECK (best_score BETWEEN 1 AND 1000000000),
 bricks_broken INTEGER NOT NULL DEFAULT 0 CHECK (bricks_broken BETWEEN 0 AND 100000000),
 best_combo INTEGER NOT NULL DEFAULT 0 CHECK (best_combo BETWEEN 0 AND 1000000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY (board_key,player_id)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_best ON leaderboard_scores(best_score DESC,best_combo DESC,bricks_broken DESC,updated_at ASC);
