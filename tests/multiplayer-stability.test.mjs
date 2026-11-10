import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { arenaLayout, bricks } from "../src/game-core.mjs";

const source = readFileSync(new URL("../src/multi.mjs", import.meta.url), "utf8");
const declarationStart = source.indexOf("const MULTIPLAYER_HTML=");
const declarationEnd = source.indexOf("\nexport default", declarationStart);
const html = new Function(source.slice(declarationStart, declarationEnd) + ";\nreturn MULTIPLAYER_HTML;")();

test("multiplayer layouts keep substantially more square bricks across player counts", () => {
  for (const ratio of [375 / 812, 9 / 16, 1, 16 / 9, 21 / 9]) {
    const arena = arenaLayout(ratio);
    for (const count of [2, 3, 4]) {
      const totals = [];
      for (let level = 1; level <= 8; level++) {
        const board = bricks("QAARENA", level, count, arena);
        const repeated = bricks("QAARENA", level, count, arena);
        assert.equal(board.hp, repeated.hp);
        assert.equal(board.colors, repeated.colors);
        assert.equal(board.hp.length, arena.cols * arena.rows);
        assert.ok(board.total < bricks("QAARENA", level, 1, arena).total);
        totals.push(board.total);
      }
      const average = totals.reduce((sum, value) => sum + value, 0) / totals.length;
      assert.ok(average >= (count === 2 ? 350 : count === 3 ? 250 : 180), ratio + " " + count + "P " + average);
    }
  }
});

test("multiplayer rooms generate a fresh layout on each new round", () => {
  const start = source.indexOf("function startRound(r){");
  const end = source.indexOf("\nfunction paddleFor(", start);
  assert.ok(start >= 0 && end > start);
  const startRound = new Function(
    "bricks", "arenaLayout", "resetBall",
    source.slice(start, end) + "\nreturn startRound;"
  )(bricks, arenaLayout, room => { room.balls = []; });
  const room = {
    code: "ABCDEF",
    arena: arenaLayout(16 / 9),
    round: 0,
    players: [
      { id: "p1", seat: 0, online: true },
      { id: "p2", seat: 2, online: true },
    ],
  };
  const layouts = [];
  for (let round = 1; round <= 8; round++) {
    startRound(room);
    assert.equal(room.level, round);
    assert.equal(room.round, round);
    layouts.push(room.board.hp);
  }
  assert.equal(new Set(layouts).size, layouts.length);
});

test("multiplayer retro visuals do not animate full-screen brightness", () => {
  assert.ok(html.includes("repeating-linear-gradient"));
  assert.ok(!html.includes("animation:flick"));
  assert.ok(!html.includes("animation:roll"));
  assert.ok(!html.includes("sin(tm*47.)"));
});

test("the brick cache only repaints changed cells and clears on a fresh round or theme", () => {
  const start = html.indexOf("function paintTiles(board){");
  const end = html.indexOf("\nfunction draw(now){", start);
  assert.ok(start > 0 && end > start);
  const clears = [], draws = [];
  const tileCtx = { clearRect: (...args) => clears.push(args) };
  const drawer = (context, x, y, size, life) => {
    context.clearRect(x, y, size, size);
    draws.push([x, y, life]);
  };
  const cache = new Function(
    "tileCtx", "drawBrickTile",
    `const GRID_COLS=58,GRID_ROWS=64,GRID_X=6,GRID_Y=40,GRID_SIZE=6;
const tiles={width:360,height:640};
const PALETTE={clean:[],vintage:[],vapor:[]};
let style="clean",drawnStyle=null,drawnPalette=null,drawnVaporPalette=null,drawnHP=null;
${html.slice(start, end)}
return {paintTiles,reset:()=>{drawnHP=null;},setStyle:s=>{style=s;}};`
  )(tileCtx, drawer);
  const board = bricks("CACHEQA", 1, 2);
  cache.paintTiles(board);
  assert.ok(clears.some(args => args[0] === 0 && args[1] === 0 && args[2] === 360 && args[3] === 640));
  const initialDraws = draws.length, initialClears = clears.length;
  cache.paintTiles(board);
  assert.equal(draws.length, initialDraws);
  assert.equal(clears.length, initialClears);
  const changedAt = board.hp.indexOf("1");
  assert.ok(changedAt >= 0);
  const damaged = { ...board, hp: board.hp.slice(0, changedAt) + "0" + board.hp.slice(changedAt + 1) };
  cache.paintTiles(damaged);
  assert.equal(draws.length, initialDraws + 1);
  cache.reset();
  cache.paintTiles(board);
  assert.ok(clears.filter(args => args[2] === 360 && args[3] === 640).length >= 2);
  cache.setStyle("vintage");
  cache.paintTiles(board);
  assert.ok(clears.filter(args => args[2] === 360 && args[3] === 640).length >= 3);
});
