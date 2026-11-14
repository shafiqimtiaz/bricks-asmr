# Bricks ASMR

A browser-based brick-breaker with Solo mode, a global leaderboard, and a live, single-board multiplayer mode.

**Play:** https://bricks-asmr.shafiqimtiaz.workers.dev  
**Multiplayer Lobby:** https://bricks-asmr.shafiqimtiaz.workers.dev/multiplayer

The Bricks ASMR home screen opens a unified **Lobby** with **Single Player** and **Multiplayer** choices, consistent pixel graphics and a compact in-game menu. Multiplayer keeps one authoritative room-shaped game world, chosen from the host's aspect ratio, and rotates the board locally so **every player sees their own paddle at the bottom**. The shared brick generator reflows square cells across portrait, tablet, desktop and TV layouts without stretching the game. Side paddles are proportionally balanced against top/bottom paddles; all four seats continue sharing the same bricks, balls and power-ups. Players keep their side as friends join or leave, without snapping to a new camera. Reopening a seat in another tab moves control to that tab rather than endlessly reconnecting the original tab. Use **COPY LINK** in a room to invite friends: opening a room-specific invite URL asks new players to enter their own gamer name before joining. Existing authenticated members resume their seat without duplicating it. Only `/multiplayer/CODE` invite links are supported; manual code joining remains available. Multiplayer boards come from the same generator as Solo: each round gets a fresh seed and is a complete brick field (walls, colour regions, corridors, power-ups) built on a smaller field that leaves a lane in front of every paddle. New boards use the versioned procedural generator (V2): six seed-derived chamber patterns, narrow accessible entrances, permanent reflective walls, and rare bounded brick cascades. Existing seed links without `?v=2` keep their original V1 layout and historical score keys; new links carry `?v=2`. There are no numbered levels. See [the multiplayer plan](docs/MULTIPLAYER_REDESIGN.md) for implemented features and remaining parity/testing work.

Solo scores are saved in Cloudflare D1 and visible in one **global leaderboard** across every seed, including historical results. All saved runs are shown (with pagination), including historical scores. Player renaming uses an in-game dialog and updates the public display name on saved results.

## Install as an app

Open Bricks ASMR in a browser over HTTPS. On Chrome or Edge, use **Install app** from the address bar or browser menu; on Android Chrome use **Install app** or **Add to Home screen**. On iPhone or iPad, use Safari's Share menu and **Add to Home Screen**.

The installed app launches in a standalone window. Single Player can reopen offline after the initial online visit; live multiplayer rooms and world rankings still require internet access.

## Development and deployment

Requires Node.js 22.18 or later. Cloudflare Workers serves production requests; no always-running Node server is required.

```sh
npm install
npm run dev      # Run locally
npm run build    # Build/validate without uploading
npm run check    # Equivalent dry-run validation
npm test         # Shared-board regression tests
npm run deploy   # Deploy to Cloudflare
```

For a manual deployment, log in once with `npx wrangler login` or set `CLOUDFLARE_API_TOKEN`.

### Cloudflare Workers Builds (GitHub)

The existing Worker `bricks-asmr` is linked to [shafiqimtiaz/bricks-asmr](https://github.com/shafiqimtiaz/bricks-asmr). Workers Builds watches `main` and deploys from the repository root.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Preview builds | Disabled |
| Build Node.js version | 24 (Cloudflare's default) |

The Build system uses an existing **user-scoped Cloudflare build token**; replace it with a dedicated Bricks token when one can be provisioned. Keep credentials in Cloudflare, never in GitHub source.

### Configuration and bindings

[wrangler.jsonc](wrangler.jsonc) is the **only** Worker deployment configuration. Cloudflare's beta `cf deploy` CLI currently rejects the first unattended deployment of a Worker that was previously uploaded via Cloudflare's script API; we switched to the supported Wrangler CLI to avoid that problem.

| Binding | Resource |
| --- | --- |
| `DB` | Existing D1 `786779d1-68ed-49d0-a6ee-434d76143b85` |
| `ROOMS` | Existing SQLite Durable Object class `BrickRoom`, migration `v1` |

Do not change, clear, or recreate these resources as part of app deployment. `schema.sql` is reference-only and must not be automatically applied to production.

### Current source

- `src/index.js` — routing and the leaderboard API
- `src/solo.html`, `src/leaderboard.html` — the Solo game and leaderboard pages
- `src/engine.js` — the one game simulation (bricks, balls, paddles, power-ups, lives, crusher) used by Solo in the browser and by every multiplayer room
- `src/multi.js` — multiplayer routing and the Durable Object that owns lobby, seats, auth, reconnects and broadcasts around one engine state per round
- `src/multiplayer.html` — the multiplayer lobby and game client
- `src/game-core.js` — shared physics helpers, the legacy board generator, player camera, stage layout, brick art and sound. The pages are imported as text and shared functions are injected when served.
- `src/level-v2.js` — seeded chamber and corridor generator with reachability checks; separate from the legacy generator for repeatable older runs.
- `docs/MULTIPLAYER_REDESIGN.md` — shared-board implementation, accepted layout and remaining TypeScript/physics parity tasks

The future TypeScript migration is described in the design document, not implemented by this build-system change.

### After each deployment

Verify:

1. `/` — original Solo game
2. `/leaderboard` — leaderboard
3. `/multiplayer` — one responsive shared board, live room and occupied edge paddles
4. D1 and Durable Object bindings still resolve correctly
