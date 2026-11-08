# Bricks ASMR

A browser-based brick-breaking game with relaxing visual effects, a global leaderboard, and real-time four-sided multiplayer.

**Play:** https://bricks-asmr.shafiqimtiaz.workers.dev

**Global leaderboard:** https://bricks-asmr.shafiqimtiaz.workers.dev/leaderboard

## Modes

- **Solo:** Original brick-breaking game with themes and daily challenges.
- **Global leaderboard:** Fastest recorded clear time per player, challenge seed, level, and visual mode, stored in Cloudflare D1.
- **Multiplayer:** 2–4 people in a code-based lobby. Each player sees their own paddle at the bottom, with a rotationally symmetric arena. Cloudflare Durable Objects coordinate the live board over WebSockets.

## Leaderboard design

The high-score screen and in-game trophy panel share the game's arcade aesthetic. The selected theme carries between gameplay and the leaderboard:

- **Clean:** Neutral monochrome, crisp text, no CRT scanlines.
- **CRT:** Pixel font, scanlines, colorful bricks, coral and cyan accents.
- **Vapor:** Neon pink/cyan, purple backdrop, and arcade glow.

Daily challenges use a UTC date seed. Rankings are community-submitted rather than independently verified gameplay results.

## Development

Requires Node.js and a Cloudflare account authorized for Workers, Durable Objects, and D1.

```sh
npm install
npm run dev
```

Deploy the same Worker to Cloudflare:

```sh
npm run deploy
```

The Worker is configured in `cloudflare.config.ts` and deployed with the `cf` CLI (via the npm scripts). Its D1 database `bricks-asmr` already exists in the Cloudflare account. `schema.sql` documents the leaderboard table and its ranking index; review migrations before applying them to production.

## Architecture

- `src/index.mjs` — solo game, leaderboard endpoints/UI, multiplayer routing
- `src/multi.mjs` — multiplayer UI and authoritative Durable Object game room
- `cloudflare.config.ts` — Worker entrypoint, D1 and Durable Object bindings
- `schema.sql` — leaderboard storage schema and ranking index

No credentials are checked into source control.

## Deployment

Cloudflare Workers serves the site. The repository contains the currently deployed game and leaderboard source. Run `npm run deploy` to deploy changes; committing to `main` does not itself guarantee a Cloudflare deployment unless Workers Builds is configured.
