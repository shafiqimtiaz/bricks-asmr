import assert from "node:assert/strict";
import test from "node:test";
import { brickEngine } from "../src/engine.js";
import { arenaLayout, bricks, infiniteOpeningBoard } from "../src/game-core.js";

// Infinite mode: the board descends one row at a time on a timer and never
// stops until the lowest row reaches a paddle. The engine treats infinite
// as a flag, not a mode, so lives/pool/serve behaviour is unchanged.
const arena = arenaLayout(9 / 16);
const soloArena = { ...arena, rows: Math.max(arena.rows, Math.ceil((536 - 10 - arena.gridY) / arena.cell)) };
const boardSpan = board => {
  const cols = soloArena.cols;
  let minC = cols, maxC = -1;
  for (let i = 0; i < board.hp.length; i++) if (board.hp[i] !== "0") {
    const c = i % cols; minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  return [minC, maxC];
};
const infiniteSolo = (seed = "inf1") => {
  const E = brickEngine(() => .5), board = infiniteOpeningBoard(seed, soloArena);
  const S = E.create({ arena: soloArena, board, players: [{ id: "me", seat: 0 }], mode: "solo", set: "vintage", lives: 5, infinite: true });
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
  const classic = E.create({ arena: soloArena, board, players: [{ id: "me", seat: 0 }], mode: "solo", set: "vintage", lives: 5 });
  assert.equal(classic.infinite, false);
  assert.equal(classic.descent, undefined);
});

test("Infinite Solo starts at the ceiling with a safe paddle lane and more power-ups", () => {
  const { S, board } = infiniteSolo();
  assert.ok(S.rowCount[0] > 0, "brick formation starts at the ceiling");
  assert.equal(S.rowCount[S.ROWS - 1], 0, "the paddle lane remains open");
  assert.equal(board.hp.length, soloArena.cols * soloArena.rows);
  const openingRows = Math.max(24, Math.floor(soloArena.rows * .48));
  const classic = bricks("inf1", 1, { ...soloArena, rows: openingRows });
  const count = s => [...s].filter(x => x !== "0").length;
  assert.ok(count(board.powerups) > count(classic.powerups), "Infinite gets more useful capsules than the V4 opening");
  assert.ok(![...board.powerups].some(x => x === "7" || x === "a"), "Infinite excludes hyper and timer capsules");
});

test("after eight seconds the board moves down one row and a new row fills the ceiling", () => {
  const { E, S } = infiniteSolo();
  for (let i = 0; i < 479; i++) E.step(S, 1 / 60);
  assert.equal(S.descent.rows, 0);
  const firstRow = S.hp.slice(0, S.COLS);
  const before = S.remaining;
  const events = [];
  for (let i = 0; i < 3; i++) events.push(...E.step(S, 1 / 60));
  assert.equal(S.descent.rows, 1);
  assert.equal(S.crush.target[0], 0, "the stream scrolls without translating the entire grid");
  assert.deepEqual(S.hp.slice(S.COLS, S.COLS * 2), firstRow, "the former ceiling row moved down");
  assert.ok(S.rowCount[0] > 0, "there is no empty row at the ceiling");
  assert.ok(S.remaining > before);
  assert.ok(events.some(e => e.t === "board"), "the renderer receives a full board refresh");
});

test("Infinite Solo slides smoothly between incoming rows", () => {
  const { E, S } = infiniteSolo();
  E.step(S, 2);
  assert.ok(S.crush.by > 0 && S.crush.by < S.CS, "the grid moves between row arrivals");
  S.descent.t = S.descent.interval - 1 / 30;
  E.step(S, 1 / 60);
  const lastY = S.GY + S.crush.by;
  E.step(S, 1 / 60);
  const nextY = S.GY + S.CS + S.crush.by;
  assert.ok(Math.abs(nextY - lastY) < S.CS / 8, "the transition to the next row is seamless");
});

test("new rows extend the exact original V4 seed geometry, colours and power-ups", () => {
  const { E, S, board } = infiniteSolo("face00");
  const cols = S.COLS, rows = [];
  for (let r = 0; r < S.ROWS; r++) {
    if (board.hp.slice(r * cols, (r + 1) * cols).replace(/0/g, "").length) rows.push(r);
  }
  assert.ok(rows.length > 8);
  const source = rows[1];
  S.descent.t = S.descent.interval;
  E.step(S, 1 / 60);
  const expected = (value, radix) => Array.from(value.slice(source * cols, (source + 1) * cols), x => parseInt(x, radix));
  assert.deepEqual(Array.from(S.hp.slice(0, cols)), expected(board.hp, 10), "new HP follows the seed rather than synthetic bricks");
  assert.deepEqual(Array.from(S.col.slice(0, cols)), expected(board.colors, 16), "new colours follow the seed's regions and walls");
  assert.deepEqual(Array.from(S.pu.slice(0, cols)), expected(board.powerups, 16), "power-ups keep the same seed's placement");
});

test("the infinite stream reflects the source motif at each end without a seam or random rows", () => {
  const seed = "9K7YBR", board = infiniteOpeningBoard(seed, soloArena), cols = soloArena.cols, motif = [];
  for (let r = 0; r < soloArena.rows; r++) {
    if ([...board.hp.slice(r * cols, (r + 1) * cols)].some(x => x !== "0")) motif.push(r);
  }
  const period = (motif.length - 1) * 2;
  for (const tick of [1, 2, motif.length - 1, motif.length, period, period + 1]) {
    const E = brickEngine(() => 0), S = E.create({arena:soloArena,board,players:[{id:"me",seat:0}],mode:"solo",set:"vintage",lives:5,infinite:true});
    S.descent.rows = tick - 1;
    S.descent.t = S.descent.interval;
    E.step(S, 1 / 60);
    const phase = tick % period, row = motif[phase < motif.length ? phase : period - phase];
    assert.deepEqual(Array.from(S.hp.slice(0, cols)),
      Array.from(board.hp.slice(row * cols, (row + 1) * cols), Number), "descent " + tick + " must use the original V4 pattern");
    assert.ok(S.rowCount[0] > 0, "the ceiling never becomes empty");
  }
});

test("incoming rows depend on the board seed, not the engine's random source", () => {
  const board = infiniteOpeningBoard("abcdef", soloArena), rows = [];
  for (const randomValue of [0, .5, .99]) {
    const E = brickEngine(() => randomValue), S = E.create({arena:soloArena,board,players:[{id:"me",seat:0}],mode:"solo",set:"vintage",lives:5,infinite:true});
    S.descent.t = S.descent.interval;
    E.step(S, 1 / 60);
    rows.push({hp:[...S.hp.slice(0,S.COLS)],colors:[...S.col.slice(0,S.COLS)],powerups:[...S.pu.slice(0,S.COLS)]});
  }
  assert.deepEqual(rows[0], rows[1]);
  assert.deepEqual(rows[1], rows[2]);
});

test("the continuous feed stays symmetric and never runs out of spawn rows", () => {
  const { E, S } = infiniteSolo();
  for (let tick = 0; tick < 28; tick++) {
    S.descent.t = S.descent.interval;
    E.step(S, 1 / 60);
    assert.equal(S.status, "play", "the run is still active at descent " + (tick + 1));
    assert.ok(S.rowCount[0] > 0, "fresh bricks still enter at descent " + (tick + 1));
    for (let c = 0; c < S.COLS; c++) {
      assert.equal(S.hp[c], S.hp[S.COLS - 1 - c], "incoming row is symmetric");
      assert.equal(S.pu[c], S.pu[S.COLS - 1 - c], "incoming power-ups are symmetric");
    }
  }
});

test("the descending grid ends the run when bricks reach the paddle, even while aiming", () => {
  const { E, S } = infiniteSolo();
  S.hp.fill(0); S.rowCount.fill(0); S.colCount.fill(0); S.remaining = 0;
  const cell = (S.ROWS - 2) * S.COLS;
  S.hp[cell] = 1; S.rowCount[S.ROWS - 2] = 1; S.colCount[0] = 1; S.remaining = 1;
  S.descent.t = S.descent.interval;
  const events = E.step(S, 1 / 60);
  assert.equal(S.status, "over");
  assert.equal(S.result.reason, "crushed");
  assert.ok(events.some(e => e.t === "end" && e.reason === "crushed"));
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

// A 2-player Infinite room, as the server builds it: coop engine, shared
// pool, 5s serve hold, V3 board. Live QA found these rounds ending at
// exactly 0:13 — the first descent refilled grid row 0, which sits past
// the top paddle line, so the top gap went negative at once.
const infiniteDuo = (seed = "9K7YBR", lives = 6) => {
  const E = brickEngine(() => .5), board = bricks(seed, 2, arena, 3);
  const S = E.create({ arena, board, players: [{ id: "me", seat: 0 }, { id: "guest", seat: 2 }], mode: "coop", set: "clean", lives, holdSeconds: 5, maxBalls: 1, server: "me", infinite: true });
  return { E, S, board };
};

test("a 2-player infinite room survives its first descent on both edges", () => {
  const { E, S } = infiniteDuo();
  assert.ok(E.crushGap(S, 0) > 0 && E.crushGap(S, 2) > 0, "both gaps start open");
  assert.equal(S.rowCount[0], 0, "grid row 0 starts empty");
  playFrames(E, S, 60 * 9);
  assert.ok(S.descent.rows >= 1, "at least one descent fired");
  assert.equal(S.status, "play", "the round did not end on the first descent");
  assert.ok(E.crushGap(S, 0) > 0, "bottom gap still open");
  assert.ok(E.crushGap(S, 2) > 0, "top gap still open");
  assert.equal(S.rowCount[0], 0, "grid row 0 is never refilled");
});

test("a 2-player infinite room keeps coming for a minute without crushing", () => {
  const { E, S } = infiniteDuo("9K7YBR", 50);
  playFrames(E, S, 60 * 60);
  assert.equal(S.status, "play");
  assert.ok(S.descent.rows >= 6, "several rows descended, got " + S.descent.rows);
  assert.ok(E.crushGap(S, 0) > 0 && E.crushGap(S, 2) > 0, "both gaps still open");
});
