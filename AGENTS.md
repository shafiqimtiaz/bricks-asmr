# AGENTS.md

Agent notes for bricks-asmr (Bricks ASMR: a brick-breaker game served from Cloudflare Workers).

- Main branch deploys live to bricks.shafq.dev. Work on main; pull before pushing, the owner pushes his own commits often.
- `npm test` runs the suite (`node --test`).
- `src/` holds the game (solo.html, multiplayer.html, multi.js, engine.js, game-core.js); `tests/` holds the suite.

<!-- changelog:start -->
## Recent changes (auto-generated)

Updated automatically on every push to main by `.github/workflows/changelog.yml`. Newest first. Full history: `git log`.

- 2026-11-14 `efe18eb` Fix changelog loop guard to match the bot commit subject
- 2026-11-14 `113f97d` Add automated changelog to AGENTS.md
- 2026-11-14 `88e454e` Restore serve prompt and fix stale multiplayer lives/results text
- 2026-11-14 `9fc4954` Generate adjective–noun names for new players (#45)
- 2026-11-14 `dd34fdc` Continue Infinite bricks with the seeded V4 pattern
- 2026-11-14 `b10b185` Fix Worker build SQL string quoting
- 2026-11-14 `47cb194` Fix Infinite Solo scrolling brick field and power-up balance
- 2026-11-14 `2c69740` Shape procedural V4 boards with subtle uncanny pareidolia
- 2026-11-14 `9a82517` Unify pixel typography and curved CRT glass on every screen
- 2026-11-14 `735253e` Remove legacy board versions and keep V4 only
- 2026-11-14 `5c7224e` Deepen Infinite MIDI as board descends; show lives remaining and reseed retries
- 2026-11-14 `12fed08` Unify leaderboard and menus with liminal CRT minimalism
- 2026-11-14 `db9fa12` Restore full procedural board geometry for Infinite
- 2026-11-14 `4ca8066` Replace danger heartbeat with life-based MIDI pitch
- 2026-11-14 `834d62c` Handle legacy Durable Object brick score counters safely
- 2026-11-14 `0fdf227` Release Liminal Edition with timed Infinite crash and dual global rankings
- 2026-11-14 `49f3425` Pause the Solo run while the menu or panel is open
- 2026-11-14 `3d00abf` Blur the name field on entering a room so Space can launch
- 2026-11-14 `5b4a830` Combine mirrored geometric levels with procedural ricochet and chain mechanics
- 2026-11-14 `5462a85` Refill Infinite bricks beside the formation, not grid row 0
- 2026-11-14 `974f7b8` Infinite descent keeps ticking while the ball is held; fix trait line in Infinite Solo
- 2026-11-14 `361dce0` Fix intermittent multiplayer paddle returns
- 2026-11-14 `f1adcfc` Keep capsule contents out of multiplayer broadcasts; accept V3 generator arg in shared-board test
- 2026-11-14 `2fa4a3a` Add Infinite mode for Solo and Multiplayer
- 2026-11-14 `0727c5f` Generate distinct procedural V3 level silhouettes while preserving previous seeds
- 2026-11-14 `41c9dad` Remove completed one-time branch cleanup workflow
- 2026-11-14 `2b481c8` Prune safe historical refs with no unique commits
- 2026-11-14 `5506395` Prune merged feature branches safely via one-time GitHub Actions job
- 2026-11-14 `6828582` Add versioned procedural ricochet chambers and permanent reflector walls
- 2026-11-14 `f97c8f9` Polish multiplayer connection feedback, remote paddles and hit response
<!-- changelog:end -->
