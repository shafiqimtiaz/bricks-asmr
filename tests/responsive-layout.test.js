import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, boardView, stageFit, viewPoint } from "../src/game-core.js";
import { brickEngine } from "../src/engine.js";
import { multiHtml, soloHtml } from "./helpers.js";

const E = brickEngine();
// A player's paddle as the client draws it: the engine's centre, face and width.
function paddleRect(arena, seat, t) {
  const S = { W: arena.width, wx: arena.square ? 6 : 0, players: [{ id: "me", seat, pw: 64 * arena.cell / 6 }] }, pw = S.players[0].pw;
  const c = E.paddleAt(S, "me", t), face = E.face(S, seat), horizontal = seat === 0 || seat === 2;
  return { x: horizontal ? c - pw / 2 : seat === 1 ? face - 7 : face, y: horizontal ? (seat === 0 ? face : face - 7) : c - pw / 2,
    w: horizontal ? pw : 7, h: horizontal ? 7 : pw, half: pw / 2 };
}

const viewports = [
  [320, 568], [375, 812], [390, 844], [844, 390], [768, 1024], [1024, 768],
  [1280, 800], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160], [7680, 4320],
];

test("the stage fits every screen without distortion and never hides play under the HUD", () => {
  for (const [vw, vh] of viewports) for (const open of [true, false]) for (const hud of [0, 44, 57]) {
    const arena = arenaLayout(vw / vh);
    const fit = stageFit(vw, vh, arena.width, arena.height, open, hud);
    assert.ok(Math.abs(fit.width / fit.height - arena.width / arena.height) < 1e-9);
    assert.ok(fit.width > 0 && fit.height > 0);
    assert.ok(fit.width + fit.edge * 2 + (fit.dock ? fit.sidebar + fit.gap : 0) <= vw + 0.01, vw + "x" + vh);
    assert.ok(fit.height + fit.hudOver + fit.edge * 2 <= vh + 0.01, vw + "x" + vh + " hud " + hud);
    // Whatever part of the HUD does not fit the 36-pixel band is placed above the stage.
    assert.ok(hud - fit.hudOver <= 36 * fit.height / arena.height + 0.01);
    assert.ok(fit.unit >= 3 && fit.unit <= 14);
  }
});

test("the lobby docks beside the stage on wide screens and overlays it on phones", () => {
  for (const [vw, vh] of [[1024, 768], [1280, 800], [1920, 1080], [3840, 2160]]) {
    const arena = arenaLayout(vw / vh), fit = stageFit(vw, vh, arena.width, arena.height, true);
    assert.equal(fit.dock, true);
    assert.ok(fit.sidebar >= 320);
    assert.ok(fit.stageLeft >= fit.edge);
    assert.ok(Math.abs(fit.stageLeft * 2 + fit.width + fit.sidebar + fit.gap - vw) < 0.01);
  }
  assert.equal(stageFit(390, 844, 360, 640, true).dock, false);
  assert.equal(stageFit(1920, 1080, 1138, 640, false).dock, false);
});

test("both pages use the shared stage fit, pixel-capped canvases and touch-sized controls", () => {
  for (const html of [soloHtml, multiHtml]) {
    assert.ok(html.includes("stageFit(vw, vh,"));
    assert.ok(html.includes("Math.sqrt(4000000 / Math.max(1, r.width * r.height))"));
    assert.ok(html.includes("@media (pointer:coarse)"));
    assert.ok(html.includes("#hud{top:calc(var(--hud-over,0px)*-1)}"));
  }
  assert.ok(multiHtml.includes("#panel input,#panel .roomOption input{font:16px"), "inputs must not trigger iOS zoom");
});

test("every seat's camera puts that player's paddle at the bottom, above the touch surface", () => {
  for (const ratio of [0.46, 9 / 16, 1, 16 / 9]) {
    const arena = arenaLayout(ratio);
    for (const seat of [0, 1, 2, 3]) {
      const view = boardView(arena, seat), side = seat === 1 || seat === 3;
      assert.equal(view.width, (side ? 504 : arena.width - 12) + 12);
      assert.equal(view.height, (side ? arena.width - 12 : 504) + 136);
      // The court's corners land exactly on the view's court rectangle: a pure rotation, no stretch.
      const xs = [], ys = [];
      for (const [x, y] of [[6, 40], [arena.width - 6, 40], [6, 544], [arena.width - 6, 544]]) {
        const point = viewPoint(view, x, y); xs.push(point.x); ys.push(point.y);
      }
      assert.ok(Math.abs(Math.min(...xs) - 6) < 1e-9 && Math.abs(Math.max(...xs) - (view.width - 6)) < 1e-9);
      assert.ok(Math.abs(Math.min(...ys) - 40) < 1e-9 && Math.abs(Math.max(...ys) - (view.height - 96)) < 1e-9);
      // Own paddle: just inside the bottom of the court, seven pixels above the touch surface.
      const own = paddleRect(arena, seat, 0.5);
      const a = viewPoint(view, own.x, own.y), b = viewPoint(view, own.x + own.w, own.y + own.h);
      const bottom = Math.max(a.y, b.y);
      assert.ok(Math.abs(bottom - (view.height - 97)) < 1e-9, "seat " + seat + " paddle bottom " + bottom);
      assert.ok(Math.abs((a.x + b.x) / 2 - view.width / 2) < 1e-9);
      assert.equal(view.height - 90 - bottom, 7, "paddle remains above the touch surface");
      // Dragging right moves the on-screen paddle right for every rotated seat.
      const left = paddleRect(arena, seat, 0);
      const right = paddleRect(arena, seat, 1);
      const lx = viewPoint(view, left.x + left.w / 2, left.y + left.h / 2).x;
      const rx = viewPoint(view, right.x + right.w / 2, right.y + right.h / 2).x;
      assert.ok(lx < rx);
      const wall = seat === 0 || seat === 2 ? 0 : 6; // a top or bottom paddle runs the full width, a side one the court height
      assert.ok(Math.abs(lx - left.half - wall) < 1e-9 && Math.abs(rx + right.half - (view.width - wall)) < 1e-9, "paddle reaches both ends");
    }
  }
});
