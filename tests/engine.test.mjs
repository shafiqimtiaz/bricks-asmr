import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../src/game-core.mjs";
import { brickEngine, engineSource } from "../src/engine.mjs";

const { arenaLayout, bricks, soloCoreSource } = core;
function seeded(seed) { let a = seed; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Recorded from the Solo game code before it moved onto the shared engine: the same seeded randomness
// and autopilot must play out frame for frame the same.
const SOLO_GOLDEN = [
  { seed: "abc123", level: 1, set: "clean", frames: 1415, state: "clear", remaining: 0, balls: 306, lives: 7, hp: 4066922503 },
  { seed: "zz9q", level: 4, set: "clean", frames: 7454, state: "clear", remaining: 0, balls: 2500, lives: 9, hp: 4066922503 },
  { seed: "d20261112", level: 1, set: "clean", frames: 6137, state: "over", remaining: 2629, balls: 1, lives: 3, hp: 1623717883 },
  { seed: "abc123", level: 1, set: "vintage", frames: 3843, state: "clear", remaining: 0, balls: 7, lives: 5, hp: 4066922503 },
  { seed: "k3k3", level: 7, set: "vintage", frames: 2560, state: "clear", remaining: 0, balls: 12, lives: 5, hp: 4066922503 },
  { seed: "qq", level: 12, set: "vintage", frames: 5530, state: "over", remaining: 2824, balls: 1, lives: 5, hp: 1849668230 },
  { seed: "zz9q", level: 4, set: "vapor", frames: 1062, state: "clear", remaining: 0, balls: 170, lives: 5, hp: 4066922503 },
  { seed: "qq", level: 12, set: "vapor", frames: 4396, state: "clear", remaining: 0, balls: 1446, lives: 5, hp: 4066922503 },
  { seed: "m0on", level: 2, set: "vapor", frames: 8590, state: "over", remaining: 2890, balls: 1, lives: 4, hp: 695253866 },
];

test("Solo on the shared engine plays exactly as the original Solo did", () => {
  const arena = arenaLayout(9 / 16);
  for (const g of SOLO_GOLDEN) {
    const E = brickEngine(seeded(42));
    const S = E.create({ arena, board: bricks(g.seed, g.level, 1, arena), players: [{ id: "me", seat: 0 }], mode: "solo", set: g.set, lives: 5, level: g.level, daily: /^d\d{8}$/.test(g.seed) });
    const pilot = () => { let best = null; for (const b of S.balls) if (b.vy > 0 && (!best || b.y > best.y)) best = b; return best ? best.x + ((best.x * 7) % 11 - 5) : 180; };
    let frames = 0;
    while (frames < 30000 && S.status === "play") {
      if (E.holding(S, "me")) E.launch(S, "me");
      E.setPaddle(S, "me", pilot());
      E.step(S, 1 / 60);
      frames++;
    }
    const hp = S.hp.reduce((x, v, i) => (x * 31 + v * (i + 1)) >>> 0, 7);
    assert.deepEqual({ frames, state: S.status, remaining: S.remaining, balls: S.balls.length, lives: S.pool, hp },
      { frames: g.frames, state: g.state, remaining: g.remaining, balls: g.balls, lives: g.lives, hp: g.hp }, g.seed + " " + g.set);
  }
});

function engineFor(seats, mode = "versus") {
  const arena = arenaLayout(9 / 16), E = brickEngine(() => .5);
  const S = E.create({ arena, board: bricks("edges", 1, seats.length, arena), players: seats.map(seat => ({ id: "s" + seat, seat })), mode, set: "clean", lives: 4, maxBalls: 40 });
  S.balls = [];
  return { E, S };
}

test("a paddle on any edge returns the ball inward, angled toward the side it was hit on", () => {
  const { E, S } = engineFor([0, 1, 2, 3]);
  for (const seat of [0, 1, 2, 3]) {
    const p = S.players.find(v => v.seat === seat);
    const [x, y, vx, vy] = seat === 0 ? [p.c + 10, 520, 0, 300] : seat === 2 ? [p.c + 10, 64, 0, -300] : seat === 1 ? [30, p.c + 10, -300, 0] : [S.W - 30, p.c + 10, 300, 0];
    S.balls = [{ x, y, vx, vy, owner: null, source: null }];
    for (let i = 0; i < 20 && !S.balls[0].owner; i++) E.step(S, 1 / 60);
    const b = S.balls[0];
    assert.equal(b.owner, p.id, "seat " + seat);
    // Rotated onto that player's own screen the return goes up, and toward the world +x/+y side it hit.
    const [a, bb, c, d] = core.viewMatrix(core.boardView(core.arenaLayout(9 / 16), seat));
    assert.ok(bb * b.vx + d * b.vy < 0, "inward for seat " + seat);
    const sideways = a * b.vx + c * b.vy;
    assert.ok(seat === 0 || seat === 1 ? sideways > 0 : sideways < 0, "angled for seat " + seat);
  }
});

test("a ball that leaves through a player's edge is that player's miss; empty edges are walls", () => {
  const { E, S } = engineFor([0, 2]);
  S.balls = [{ x: 30, y: 80, vx: 0, vy: -300, owner: "s0", source: "s0" }, { x: 5, y: 300, vx: -300, vy: 0, owner: "s0", source: "s0" }];
  const events = [], side = S.balls[1];
  for (let i = 0; i < 5; i++) events.push(...E.step(S, 1 / 60));
  assert.ok(side.vx > 0 && side.x > 0, "the left wall bounced the other ball");
  for (let i = 0; i < 25; i++) events.push(...E.step(S, 1 / 60));
  assert.ok(events.some(e => e.t === "miss" && e.owner === "s2"));
  assert.equal(S.players.find(p => p.id === "s2").lives, 3);
});

test("a capsule falls toward the player whose ball broke the brick, and their catch powers only their paddle", () => {
  const { E, S } = engineFor([0, 2]);
  const top = S.players.find(p => p.seat === 2);
  // A ball in play keeps the world running; its owner is the top player so any capsules it frees go there too.
  S.balls = [{ x: 180, y: 300, vx: 0, vy: 300, owner: top.id, source: top.id }];
  const mine = { x: top.c, y: 200, k: 3, c: 0, r: 0, owner: top.id };
  S.pups = [mine];
  for (let i = 0; i < 200 && S.pups.includes(mine); i++) E.step(S, 1 / 60);
  assert.ok(!S.pups.includes(mine));
  assert.ok(top.fx.wide > 0, "the catcher's paddle is wide");
  assert.ok(!(S.players.find(p => p.seat === 0).fx.wide > 0));
});

test("the crusher slides toward a lone edge and stretches toward opposite edges", () => {
  const solo = engineFor([0]).S, pair = engineFor([0, 2]).S, E = brickEngine();
  for (const S of [solo, pair]) { S.balls = [{ x: 180, y: 300, vx: 0, vy: 0, owner: "s0", source: "s0" }]; S.crush.clock = 100; E.step(S, .5); }
  assert.equal(solo.crush.ky, 1);
  assert.ok(solo.crush.by > 0);
  assert.ok(pair.crush.ky > 1);
});

test("Coop and Solo share one pool of lives; Versus loses only the misser's life", () => {
  const coop = engineFor([0, 2], "coop");
  coop.S.pool = 6;
  coop.S.balls = [{ x: 30, y: 30, vx: 0, vy: -300, owner: "s0", source: "s0" }];
  for (let i = 0; i < 20; i++) coop.E.step(coop.S, 1 / 60);
  assert.equal(coop.S.pool, 5);
  assert.equal(coop.S.balls.filter(b => b.held).length, 1);
  assert.equal(coop.S.balls[0].source, "s2", "whoever missed serves");
});

test("the engine runs from its injected browser source alongside the core helpers", () => {
  const make = new Function(soloCoreSource + "\n" + engineSource + "\nreturn brickEngine;");
  const E = make()(), arena = arenaLayout(9 / 16);
  const S = E.create({ arena, board: bricks("web", 1, 1, arena), players: [{ id: "me", seat: 0 }], mode: "solo", set: "vapor", lives: 5 });
  E.launch(S, "me");
  for (let i = 0; i < 120; i++) E.step(S, 1 / 60);
  assert.ok(S.remaining <= S.total);
});
