import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../src/game-core.js";
import { brickEngine, engineSource } from "../src/engine.js";

const { arenaLayout, bricks, soloCoreSource } = core;
function seeded(seed) { let a = seed; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test("V4 Solo replays remain deterministic under miss-driven descent", () => {
 const arena = arenaLayout(9 / 16);
 function replay(seed,set){
  const E=brickEngine(seeded(42));
  const S=E.create({arena,board:bricks(seed,1,arena),players:[{id:"me",seat:0}],mode:"solo",set,lives:5,daily:/^d\d{8}$/.test(seed)});
  const pilot=()=>{let best=null;for(const b of S.balls)if(b.vy>0&&(!best||b.y>best.y))best=b;return best?best.x+((best.x*7)%11-5):180;};
  let frames=0;
  while(frames<600&&S.status==="play"){
   if(E.holding(S,"me"))E.launch(S,"me");
   E.setPaddle(S,"me",pilot());
   E.step(S,1/60);frames++;
  }
  const hp=S.hp.reduce((x,v,i)=>(x*31+v*(i+1))>>>0,7);
  return {frames,status:S.status,remaining:S.remaining,balls:S.balls.length,lives:S.pool,hp};
 }
 for(const [seed,set] of [["abc123","clean"],["d20261114","vintage"]]){
  assert.deepEqual(replay(seed,set),replay(seed,set),seed+" "+set);
 }
});

function engineFor(seats, mode = "versus") {
  const arena = arenaLayout(9 / 16), E = brickEngine(() => .5);
  const S = E.create({ arena, board: bricks("edges", seats.length, arena), players: seats.map(seat => ({ id: "s" + seat, seat })), mode, set: "clean", lives: 4, maxBalls: 40 });
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

test("the court stays put over time and lowers one row only when a missed ball costs a life", () => {
  const arena = arenaLayout(9 / 16), E = brickEngine(() => .5);
  const S = E.create({ arena, board: bricks("edges", 1, arena), players: [{ id: "s0", seat: 0 }], mode: "solo", set: "vintage", lives: 5 });
  S.balls = [{ x: 180, y: 130, vx: 0, vy: 0, owner: "s0", source: "s0" }];
  for (let i = 0; i < 100; i++) {
    Object.assign(S.balls[0], { x: 180, y: 130, vx: 0, vy: 0 });
    assert.ok(!E.step(S, .1).some(e => e.t === "crush"));
  }
  assert.equal(S.crush.target[0], 0);
  S.balls = [{ x: 180, y: 660, vx: 0, vy: 300, owner: "s0", source: "s0" }];
  const events = E.step(S, 1 / 60);
  assert.equal(events.filter(e => e.t === "crush").length, 1);
  assert.equal(S.crush.target[0], S.CS);
  assert.equal(S.pool, 4);
  assert.equal(E.holding(S, "s0"), true);
  E.step(S, 1 / 60);
  assert.ok(S.crush.off[0] > 0, "the descent animates while the next serve is held");
  S.balls = [
    { x: 180, y: 660, vx: 0, vy: 300, owner: "s0", source: "s0" },
    { x: 180, y: 130, vx: 0, vy: 0, owner: "s0", source: "s0" }
  ];
  const bonus = E.step(S, 1 / 60);
  assert.ok(bonus.some(e => e.t === "miss"));
  assert.ok(!bonus.some(e => e.t === "crush"), "losing a bonus ball must not cause another descent");
  assert.equal(S.crush.target[0], S.CS);
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
  const S = E.create({ arena, board: bricks("web", 1, arena), players: [{ id: "me", seat: 0 }], mode: "solo", set: "vapor", lives: 5 });
  E.launch(S, "me");
  for (let i = 0; i < 120; i++) E.step(S, 1 / 60);
  assert.ok(S.remaining <= S.total);
});

test("rooms of three or four play on a square court where every seat's view is the same size", () => {
  const a = core.squareArena();
  assert.deepEqual(new Set([0, 1, 2, 3].map(s => { const v = core.boardView(a, s); return v.width + "x" + v.height; })), new Set(["516x640"]));
  const E = brickEngine(() => .5), S = E.create({ arena: a, board: bricks("square", 4, a), players: [0, 1, 2, 3].map(seat => ({ id: "s" + seat, seat })), mode: "versus", set: "clean", lives: 4 });
  const B = S.bounds;
  // The formation is centred left-right, and each paddle line is the same distance from the court's centre.
  assert.equal((B.X0 + B.X1) / 2, (E.face(S, 1) + E.face(S, 3)) / 2);
  assert.equal(E.face(S, 3) - E.face(S, 1), E.face(S, 0) - E.face(S, 2));
  // Paddles travel the same distance on every edge.
  const travel = seat => { const p = S.players.find(v => v.seat === seat); return E.paddleAt(S, p.id, 1) - E.paddleAt(S, p.id, 0); };
  assert.ok(Math.abs(Math.abs(travel(0)) - Math.abs(travel(1))) < 1e-9);
});
