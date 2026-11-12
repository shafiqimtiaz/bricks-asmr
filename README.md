# Bricks ASMR

A browser-based brick-breaker with Solo mode, a global leaderboard, and a live, single-board multiplayer mode.

**Play:** https://bricks-asmr.shafiqimtiaz.workers.dev  
**Multiplayer Lobby:** https://bricks-asmr.shafiqimtiaz.workers.dev/multiplayer

The Bricks ASMR home screen now opens a unified **Lobby** with **Single Player** and **Multiplayer** choices, consistent Clean / CRT / Vapor themes and a compact in-game menu. Multiplayer keeps one authoritative room-shaped game world, chosen from the host's aspect ratio, and rotates the board locally so **every player sees their own paddle at the bottom**. The shared brick generator reflows square cells across portrait, tablet, desktop and TV layouts without stretching the game. Side paddles are proportionally balanced against top/bottom paddles; all four seats continue sharing the same bricks, balls and power-ups. Players keep their side as friends join or leave, without snapping to a new camera. Reopening a seat in another tab moves control to that tab rather than endlessly reconnecting the original tab. Use **COPY LINK** in a room to invite friends: opening a room-specific invite URL asks new players to enter their own gamer name before joining. Existing authenticated members resume their seat without duplicating it. Only `/multiplayer/CODE` invite links are supported; manual code joining remains available. Multiplayer boards come from the same generator as Solo: each round gets a fresh seed and is a complete Solo-style board (walls, colour regions, corridors, power-ups) built on a smaller field that leaves a lane in front of every paddle. A board is identified by its seed alone; there are no levels. See [the multiplayer plan](docs/MULTIPLAYER_REDESIGN.md) for implemented features and remaining parity/testing work.

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

- `src/index.mjs` — routing and the leaderboard API
- `src/solo.html`, `src/leaderboard.html` — the Solo game and leaderboard pages
- `src/multi.mjs` — multiplayer routing and the authoritative Durable Object game state
- `src/multiplayer.html` — the multiplayer lobby and game client
- `src/game-core.mjs` — code shared by both modes and by the room server: board generator, paddle geometry, player camera, stage layout, bounce physics, brick art and sound. The pages are imported as text and the shared functions are injected into them when served.
- `docs/MULTIPLAYER_REDESIGN.md` — shared-board implementation, accepted layout and remaining TypeScript/physics parity tasks

The future TypeScript migration is described in the design document, not implemented by this build-system change.

### After each deployment

Verify:

1. `/` — original Solo game
2. `/leaderboard` — leaderboard
3. `/multiplayer` — one responsive shared board, live room and occupied edge paddles
4. D1 and Durable Object bindings still resolve correctly
