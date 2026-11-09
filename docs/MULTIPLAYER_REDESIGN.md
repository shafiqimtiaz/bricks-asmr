# Bricks ASMR — Unified Solo & Multiplayer Redesign

**Status:** Approved direction, implementation not started  
**Updated:** 2026-11-08  
**Repository:** [shafiqimtiaz/bricks-asmr](https://github.com/shafiqimtiaz/bricks-asmr)

> This document is a design and execution plan, **not a claim that the redesign is implemented**. It supersedes the existing four-paddle shared-arena multiplayer concept and any preliminary, visual-only multiplayer styling changes. Do not deploy those interim changes as the intended finished experience.

## 1. Product goal and non-negotiable requirements

Bricks ASMR has **one game and one visual identity**. Multiplayer is the original Solo game repeated for each participant, with live opponent views and a coordinated match. It is **not** a different game in which four paddles surround one square arena.

1. **One homepage.** Keep the existing Solo homepage as the primary experience. Add a lightweight Solo / Multiplayer mode entry within the existing design; do not build separate visual brands, navigation systems, or landing pages.
2. **Exactly one board per participant.** One waiting host shows one board; two joined players show two boards; three show three; four show four. Never display unoccupied decorative boards.
3. **Every board is the Solo board.** Preserve the original 9:16 proportions, brick patterns, collision model, paddle, ball mechanics, power-ups, audio, HUD language, themes (Clean / CRT-Vintage / Vapor), pixels, particles, and animations.
4. **Each participant controls their own board.** Inputs must never move another participant's paddle. Opponent boards are live read-only views.
5. **Same fair starting conditions.** All participants start the same level and seed at the same server-coordinated match time. Their boards then evolve independently through their own actions.
6. **Responsive without horizontal scrolling.** The local board remains easy to play on mobile; opponent boards resize into smaller previews rather than obstructing gameplay.
7. **Preserve Solo and its leaderboard.** Multiplayer results are a separate, room-scoped concern until trustworthy score validation is designed.
8. **Use TypeScript for the redesigned codebase**, with shared protocol types and runtime validation of untrusted messages. Migrate the existing app; do not generate an unrelated starter project.

### Explicitly out of scope

- A four-sided square shared arena or rotation-based paddle positions
- New game themes, replacement sounds, or altered Solo mechanics
- More than four participants, spectator mode, accounts, matchmaking, or chat
- Overwriting production D1 data, removing the global Solo leaderboard, or changing the current production Worker before validation

## 2. UX and layout decisions

### Home and lobby

The current Solo screen remains the home experience. A mode control enters Multiplayer without replacing the game aesthetic. Creating/joining a room, entering a display name, sharing its six-character code, viewing connected players, and starting the match all use the **same pixel typography, panels, buttons, overlays, HUD, and styles as Solo**.

Retain the existing room-code concept. The host can start once at least two players are connected. Until then the host's own Solo-shaped board is visible with the waiting overlay.

### Live board layout

| Participants | Boards on screen | Placement relative to local player |
| --- | --- | --- |
| 1 (waiting) | 1 | Local board only |
| 2 | 2 | Opponent above, local board below |
| 3 | 3 | Opponents left and right, local board primary |
| 4 | 4 | Opponents left, top, and right, local board primary |

The local board is always the principal interactive board; the other positions are dynamically assigned **for each viewer**, independently of join order. All boards stay in portrait 9:16 aspect ratio. The local board should receive the largest available area, with opponent views scaled uniformly to fit.

For mobile, prioritize the complete local board, paddle interaction zone, and HUD before sizing opponent previews. Small previews must remain recognizable and labeled. Do not shrink local controls to illegibility, clip boards, introduce a second vertical scrollable game area, or force horizontal scrolling. Design layouts for 320px, 375px, 768px, and wide desktop viewports. Respect safe-area insets and reduced-motion preferences.

### On-board information

- Local: unchanged Solo HUD and gameplay controls, plus minimal room status/score access.
- Remote: same visual renderer; compact player label, connection state, score/progress; no clickable paddle controls.
- Waiting / finished: use existing Solo-style overlays rather than switching to another page design.
- Theme choice is local presentation state. A player's Clean / Vintage / Vapor setting styles the view on their own device without changing game mechanics or requiring network messages.

## 3. Technical architecture

**Keep the existing Cloudflare Worker, D1 binding, Durable Object infrastructure, and `cloudflare.config.ts` configuration.** The present source is `src/index.mjs` and `src/multi.mjs`; these are migration inputs, not components to retain as separate gameplay implementations.

Proposed modules (an implementation target, not files that already exist):

```text
src/
  game/
    engine.ts         # existing Solo gameplay rules and deterministic simulation
    renderer.ts       # shared Solo canvas drawing, particles, themes and FX
    physics.ts        # collision logic used by Solo and Multiplayer
    audio.ts          # existing synthesized ASMR effects
    controls.ts       # touch, pointer, keyboard and slider
  modes/
    solo.ts           # one locally controlled instance; current Solo semantics
    multiplayer.ts    # local board plus 1–3 read-only remote previews
  server/
    worker.ts         # HTTP routes and existing leaderboard integration
    room.ts           # Durable Object room lifecycle and message relay
  shared/
    types.ts          # typed game/room/state model
    protocol.ts       # typed socket message contracts and boundary validation
cloudflare.config.ts  # existing account, D1 and Durable Object bindings
tsconfig.json
package.json
```

Extract existing code surgically: prove a Solo baseline first, move the same engine/renderer into shared modules, and avoid rewriting the gameplay from scratch. Both modes must import and execute the same game code.

### Runtime ownership

- **Solo engine:** Owns local physics, level generation, power-ups, game effects and controls.
- **Multiplayer client:** Owns its local Solo engine instance; receives and renders live state for opponents using the same renderer. Remote boards are view-only.
- **Durable Object:** Owns room membership, host rights, identity/session tokens, coordinated match seed and start time, room-scoped score aggregation, connection/reconnect behavior and event distribution.
- **Existing Worker/D1:** Retains the Solo/global leaderboard and API. No multiplayer score should enter the trusted Solo leaderboard merely because a client submitted it.

### Fairness and authority trade-off

The initial plan runs the complex Solo simulation on each player's device and has the Durable Object relay bounded snapshots and room events. This retains the exact existing physics without implementing a second server physics engine.

**Security limitation:** Client-reported progress and scores are not inherently trustworthy. Multiplayer match scores are provisional/room-scoped. Do not market them as cheat-proof or insert them into the global leaderboard. If verified competitive rankings later become a requirement, design authoritative simulation or verifiable replay as a separate, measured project. Do not silently trade away full Solo mechanics or responsiveness to claim server authority.

## 4. Synchronization and network protocol

Use Durable Object WebSockets, with typed discriminated message unions in a shared TypeScript module and **runtime validation** for every received JSON payload. TypeScript alone does not validate external messages.

Conceptual events:

| Direction | Message | Information |
| --- | --- | --- |
| Client → room | `join` / `resume` | Existing room code and authenticated session |
| Host → room | `start` | Start request |
| Room → all | `match-start` | Round ID, same seed/level, server start timestamp |
| Client → room | `state` | Sequence number, tick/time, bounded entity and progress data |
| Room → clients | `opponent-state` | Player ID and validated/rebroadcast state |
| Client → room | `finished` | Final room-scoped result |
| Room → all | `room-state` / `match-end` | Players, statuses, round result and lifecycle |

Do not trust an arbitrary `playerId` inside a socket message: derive sender identity from its authenticated Durable Object session. Enforce supported event types, bounded payload size, finite coordinates, valid enumerations, monotonic sequence numbers, per-client rate limits, and per-room participant limits. Use versioned protocol messages so mixed clients can fail clearly.

Share seed, level and a start timestamp, but **not** paddles, lives, brick destruction or power-ups between independent boards. Each board's state is independent after starting.

Send bounded, adaptive snapshots at a practical rate and interpolate between updates for smooth remote previews. Do **not** send screenshots or 60 full-canvas frames per second. Investigate high-ball-count and power-up states before choosing a fixed payload budget; remote preview downsampling may reduce visual detail/resolution, **not alter the actual Solo mechanics**. Slow clients should drop stale preview updates rather than delay local gameplay.

Handle socket disconnects, rejoin/resume, late snapshots and room expiry without duplicating seats or resetting another player's game. The host may not launch with fewer than two connected players. Match-start happens once per round.

## 5. Migration plan (ordered, gated)

### Phase 0 — Baseline and test harness

- Capture current Solo behavior and screenshots for Clean, CRT-Vintage and Vapor.
- Record stable seeded-level output, initial input behavior and power-up cases.
- Create reproducible 2-, 3-, and 4-client smoke tests.
- Preserve the currently deployed Worker until changes are explicitly validated.

**Gate:** Baseline checks demonstrate the original Solo experience is preserved.

### Phase 1 — TypeScript without functional changes

- Add a minimal `tsconfig.json` and TypeScript dependencies only as needed.
- Preserve `cloudflare.config.ts`; do not add a conflicting Wrangler configuration.
- Type Cloudflare bindings from project tooling and define shared messages/state.
- Introduce runtime validators at the WebSocket boundary.
- Convert current source incrementally, with build/typecheck checks after each step.

**Gate:** Solo renders and behaves as before; build and typecheck pass.

### Phase 2 — Extract the single Solo engine

- Separate gameplay rules, renderer, audio and input controls without changing behavior.
- Build a reusable game instance for local play and a view-only instance for remote snapshots.
- Keep seeded level generation, ball physics, power-ups and existing styles identical across modes.

**Gate:** Solo and Multiplayer render the same seed and initial state pixel-equivalently at the same scale/theme.

### Phase 3 — Unify navigation and multiplayer lobby

- Keep one homepage and reuse the Solo overlay/hud for mode selection and room actions.
- Reuse existing room-code and session infrastructure.
- Replace/remove the custom multiplayer page and the four-sided arena renderer.
- Ensure the lobby shows only occupied boards.

**Gate:** 1→2→3→4 and 4→3→2 player changes give the correct board count and layout.

### Phase 4 — Synchronize separate live games

- Coordinate shared round seed, level and start time through the room.
- Run each participant's complete Solo simulation locally.
- Relay remote snapshots and match events, apply interpolation, track scores and disconnects.
- Ensure each viewer's own board is always primary and exclusively controllable.

**Gate:** Four concurrent clients play independently and see all other boards updating live; stale messages cannot move or overwrite another board.

### Phase 5 — Gameplay and responsive polish

- Preserve existing slider feel, sound, themes, CRT/postprocessing and visual effects.
- Tune adaptive previews for mobile and high-ball-count scenes.
- Integrate result/round-end overlays without disrupting Solo.
- Guard against frame-rate drops, resize glitches and touch interaction conflicts.

**Gate:** No horizontal overflow or clipped controls at 320, 375, 768 and desktop widths; acceptable input responsiveness with four active boards.

### Phase 6 — Release and verify

- Review changes as a focused PR, checking screenshots and regression results.
- Run TypeScript/type checks, Solo regression tests, four-client integration tests, room recovery tests and production smoke checks.
- Merge to `main` only after acceptance; deploy from the existing Cloudflare project.
- Verify Solo homepage, multiplayer rooms and the global Solo leaderboard independently.

**Gate:** All criteria below pass. No unverified production deployment.

## 6. Definition of done / acceptance checklist

- [ ] Exactly one home experience, visually matching existing Solo.
- [ ] 1 waiting player → 1 board; 2 players → 2 boards; 3 → 3; 4 → 4.
- [ ] All boards are the original portrait Solo board, not a square four-sided arena.
- [ ] Local board occupies the primary position on every client's screen.
- [ ] Each board uses the *same* engine, physics, brick generation, power-ups, controls, themes, sound and renderer as Solo.
- [ ] Each player controls only their own board and sees other players' live progress.
- [ ] All participants receive the same level, seed and coordinated start time.
- [ ] Host permissions, four-player capacity, reconnection and match end work correctly.
- [ ] Network payloads are typed, runtime-validated, authenticated and rate-limited.
- [ ] Mobile has no horizontal scrolling, clipped boards, or inaccessible controls.
- [ ] Existing Solo game and public leaderboard remain functional and unchanged in behavior.
- [ ] No multiplayer result is treated as a cheat-proof global score.
- [ ] Type checks, functional tests and visual comparisons pass before deployment.

## 7. Implementation policy

This document records the design only. **Do not implement, merge a gameplay redesign, or deploy on the basis of this documentation commit alone.** The previous preliminary styling-only edit to `src/multi.mjs` is not the required architecture and should be superseded when implementation begins. Preserve existing production data and bindings.
