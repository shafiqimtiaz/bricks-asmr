import assert from "node:assert/strict";
import test from "node:test";
import { brickEngine } from "../src/engine.js";
import { arenaLayout, bricks } from "../src/game-core.js";

// Infinite mode: the board descends one row at a time on a timer and never
// stops until the lowest row reaches a paddle. The engine treats infinite
// as a flag, not a mode, so lives/pool/serve behaviour is unchanged.
const arena = arenaLayout(9 / 16);
const boardSpan = board => {
  const cols = arena.cols;
  let minC = cols, maxC = -1;
  for (let i = 0; i < board.hp.length; i++) if (board.hp[i] !== "0") {
    const c = i % cols; minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  return [minC, maxC];
};
const infiniteSolo = (seed = "inf1") => {
  const E = brickEngine(() => .5), board = bricks(seed, 1, arena);
  const S = E.create({ arena, board, players: [{ id: "me", seat: 0 }], mode: "solo", set: "clean", lives: 5, infinite: true });
  return { E, S, board };
};
// Keeps the ball alive the way the Solo replay pilot does.
const pilot = S => { let best = null; for (const b of S.balls) if (b.vy > 0 && (!best || b.y > best.y)) best = b; return best ? best.x + ((best.x * 7) % 11 - 5) : 180; };
const playFrames = (E, S, n) => {
  for (let i = 0; i < n; i++) {
    if (E.holding(S, "me")) E.launch(S, "me");
    E.setPaddle(S, "me", pilot(S));
    E.step(S, 1 / 60);
  }
};

test("infinite create carries descent state and the spawn span; classic has none", () => {
  const { E, S, board } = infiniteSolo();
  assert.equal(S.infinite, true);
  assert.deepEqual(S.descent, { t: 0, rows: 0, interval: 8 });
  assert.deepEqual([S.spawnC0, S.spawnC1], boardSpan(board));
  const classic = E.create({ arena, board, players: [{ id: "me", seat: 0 }], mode: "solo", set: "clean", lives: 5 });
  assert.equal(classic.infinite, false);
  assert.equal(classic.descent, undefined);
});

test("stepping ~8s descends exactly one row and refills the top row", () => {
  const { E, S } = infiniteSolo();
  assert.equal(S.rowCount[0], 0, "the top grid row starts empty");
  playFrames(E, S, 479);
  assert.equal(S.descent.rows, 0, "no descent before the 8s interval");
  const before = S.remaining;
  playFrames(E, S, 3);
  assert.equal(S.descent.rows, 1);
  assert.equal(S.crush.target[0], S.CS, "one row down, exactly as a miss does");
  assert.ok(S.rowCount[0] > 0, "the top row was refilled");
  assert.ok(S.remaining > before, "the refill adds more bricks than the ball broke");
});

test("the descent keeps ticking while the ball is still held (aiming/serving)", () => {
  const { E, S } = infiniteSolo();
  assert.ok(E.holding(S, "me"), "the ball starts held on the paddle");
  let events = [];
  for (let i = 0; i < 479; i++) events = E.step(S, 1 / 60);
  assert.equal(S.descent.rows, 0, "no descent before the 8s interval");
  assert.ok(!events.some(e => e.t === "descent"));
  const fired = [];
  for (let i = 0; i < 3; i++) fired.push(...E.step(S, 1 / 60));
  assert.equal(S.descent.rows, 1, "one row down after ~8s even without launching");
  assert.ok(fired.some(e => e.t === "descent"));
  assert.ok(E.holding(S, "me"), "the ball is still held; descent never waits on a launch");
});

test("the descent interval ramps down but never below 2.5s", () => {
  const { E, S } = infiniteSolo();
  E.launch(S, "me");
  S.descent = { t: 8, rows: 10, interval: 8 };
  E.step(S, 1 / 60);
  assert.equal(S.descent.rows, 11);
  assert.equal(S.descent.interval, Math.max(2.5, 8 * Math.pow(0.97, 11)));
  assert.ok(S.descent.interval < 8 && S.descent.interval > 2.5);
  S.descent = { t: 8, rows: 200, interval: 8 };
  E.step(S, 1 / 60);
  assert.equal(S.descent.rows, 201);
  assert.equal(S.descent.interval, 2.5, "the interval floors at 2.5s");
});

test("a miss in infinite costs a life but does not lower the court", () => {
  const { E, S } = infiniteSolo();
  S.balls = [{ x: 180, y: 660, vx: 0, vy: 300, owner: "me", source: "me" }];
  const events = E.step(S, 1 / 60);
  assert.equal(S.pool, 4, "the life is still lost");
  assert.equal(S.crush.target[0], 0, "the timer owns descent, not misses");
  assert.ok(events.some(e => e.t === "life"));
  assert.ok(!events.some(e => e.t === "crush"), "no crush event without a descent");
});

test("clearing the board in infinite does not finish the round", () => {
  const { E, S } = infiniteSolo();
  E.launch(S, "me");
  S.hp.fill(0); S.rowCount.fill(0); S.colCount.fill(0); S.remaining = 0;
  playFrames(E, S, 60);
  assert.equal(S.status, "play");
  assert.equal(S.remaining, 0, "no refill before the first interval");
});

test("the formation reaching the paddle ends an infinite run as crushed", () => {
  const { E, S } = infiniteSolo();
  E.launch(S, "me");
  S.crush.target[0] = S.crush.off[0] = 1000;
  E.step(S, 1 / 60);
  assert.equal(S.status, "over");
  assert.equal(S.result.reason, "crushed");
});
