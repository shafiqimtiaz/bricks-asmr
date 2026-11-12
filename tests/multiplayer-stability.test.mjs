import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, bricks } from "../src/game-core.mjs";

import { loadServer, multiHtml as html } from "./helpers.mjs";

test("multiplayer layouts keep substantially more square bricks across player counts", () => {
  for (const ratio of [375 / 812, 9 / 16, 1, 16 / 9, 21 / 9]) {
    const arena = arenaLayout(ratio);
    for (const count of [2, 3, 4]) {
      const totals = [];
      for (let n = 1; n <= 8; n++) {
        const seed = "QAARENA" + n;
        const board = bricks(seed, count, arena);
        const repeated = bricks(seed, count, arena);
        assert.equal(board.hp, repeated.hp);
        assert.equal(board.colors, repeated.colors);
        assert.equal(board.hp.length, arena.cols * arena.rows);
        assert.ok(board.total < bricks(seed, 1, arena).total);
        totals.push(board.total);
      }
      const average = totals.reduce((sum, value) => sum + value, 0) / totals.length;
      assert.ok(average >= (count === 2 ? 350 : count === 3 ? 250 : 180), ratio + " " + count + "P " + average);
    }
  }
});

test("multiplayer rooms generate a fresh layout on each new round", () => {
  const { startRound } = loadServer();
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
