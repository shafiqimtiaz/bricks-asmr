# Bricks ASMR

A browser-based brick-breaking game with relaxing visual effects, a global leaderboard, and real-time four-sided multiplayer.

**Play:** https://bricks-asmr.shafiqimtiaz.workers.dev

## Modes

- **Solo:** Original brick-breaking game with themes and daily challenges.
- **Global leaderboard:** Personal best times for each challenge, stored in Cloudflare D1.
- **Multiplayer:** 2–4 people in a code-based lobby. Each player sees their own paddle at the bottom, with a rotationally symmetric arena. Cloudflare Durable Objects coordinate the live board over WebSockets.

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

The Worker is configured by `wrangler.jsonc`. Its D1 database `bricks-asmr` already exists in the Cloudflare account; do not run database initialization against production without reviewing changes.

## Architecture

- `src/index.mjs` — solo game, leaderboard endpoints/UI, multiplayer routing
- `src/multi.mjs` — multiplayer UI and authoritative Durable Object game room
- `wrangler.jsonc` — Workers entrypoint, D1 and Durable Object bindings

No credentials are checked into source control.

## Deployment

Cloudflare Workers serves the site. The GitHub repository is the source of truth once Workers Builds is connected to `main`.
