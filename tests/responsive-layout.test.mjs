import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { arenaLayout } from "../src/game-core.mjs";

const pages = ["../src/index.mjs", "../src/multi.mjs"];
const viewports = [
  [320, 568], [375, 812], [768, 1024], [1024, 768],
  [1280, 800], [1366, 768], [1920, 1080], [2560, 1440],
  [3840, 2160], [7680, 4320],
];

function fitAt(source, vw, vh, panelOpen, seat = 0) {
  const start = source.indexOf("function fit(){");
  const end = source.indexOf("}\\nfunction resize(){", start);
  assert.ok(start >= 0 && end > start, "missing fit function");
  const body = source.slice(start, end + 1).replaceAll("\\n", "\n");
  const arena = arenaLayout(vw / vh);
  const props = new Map();
  const wrap = {
    classList: { toggle: (key, flag) => props.set(key, flag) },
    style: { setProperty: (key, value) => props.set(key, value) },
  };
  const window = { innerWidth: vw, innerHeight: vh, visualViewport: null };
  const document = { getElementById: (id) => id === "panel" ? { hidden: !panelOpen } : null };
  const current = { players: [{ id: "me", seat }] };
  const result = new Function(
    "window", "document", "wrap", "W", "H", "state", "you",
    "let viewW=W,viewH=H;\n" + body + "\nfit(); return {viewW,viewH};"
  )(window, document, wrap, arena.width, arena.height, current, "me");
  return {
    width: parseFloat(wrap.style.width),
    height: parseFloat(wrap.style.height),
    sidebar: parseFloat(props.get("--sidebar-width")),
    gap: parseFloat(props.get("--desktop-gap")),
    edge: parseFloat(props.get("--edge")),
    stageLeft: parseFloat(props.get("--stage-left")),
    dock: props.get("sidecar"),
    logicalWidth: result.viewW,
    logicalHeight: result.viewH,
    arena,
  };
}

for (const page of pages) {
  const source = readFileSync(new URL(page, import.meta.url), "utf8");

  test(page + ": fits mobile, tablet, desktop and TV without distorting game cells", () => {
    for (const [vw, vh] of viewports) for (const open of [true, false]) {
      const fit = fitAt(source, vw, vh, open);
      assert.ok(Math.abs(fit.width / fit.height - fit.logicalWidth / fit.logicalHeight) < 0.00001);
      assert.ok(fit.width + fit.edge * 2 <= vw + 0.01);
      assert.ok(fit.height + fit.edge * 2 <= vh + 0.01);
      assert.ok(fit.width > 0 && fit.height > 0);
      assert.equal(fit.arena.cols % 2, 0);
      assert.equal(fit.arena.rows % 2, 0);
    }
  });

  test(page + ": responsive game reorganizes its actual arena across aspect ratios", () => {
    const portrait = fitAt(source, 375, 812, false);
    const landscape = fitAt(source, 1920, 1080, false);
    const ultrawide = fitAt(source, 3440, 1440, false);
    assert.ok(portrait.logicalWidth < portrait.logicalHeight);
    assert.ok(landscape.logicalWidth > landscape.logicalHeight);
    assert.ok(ultrawide.logicalWidth > landscape.logicalWidth);
    assert.ok(landscape.width > landscape.height);
    assert.ok(landscape.arena.cols > portrait.arena.cols);
  });

  test(page + ": docks Lobby beside the stage without squeezing or stretching it", () => {
    for (const [vw, vh] of [[1024, 768], [1280, 800], [1920, 1080], [3840, 2160]]) {
      const fit = fitAt(source, vw, vh, true);
      assert.equal(fit.dock, true);
      assert.ok(fit.sidebar >= 320);
      assert.ok(fit.stageLeft >= fit.edge);
      assert.ok(Math.abs(fit.stageLeft * 2 + fit.width + fit.sidebar + fit.gap - vw) < 0.01);
    }
  });

  test(page + ": keeps circular balls and pixel-capped, proportional canvas buffers", () => {
    assert.ok(source.includes("const pixelScale = Math.min("));
    assert.ok(source.includes("Math.sqrt(4000000 / Math.max(1, r.width * r.height))"));
    assert.ok(source.includes("context.ellipse(x, y, radius * correction, radius / correction"));
    assert.ok(source.includes("@media (pointer:coarse)"));
  });
}

test("Multiplayer: the side player's camera is a true 90-degree rotation", () => {
  const source = readFileSync(new URL("../src/multi.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("ctx.transform(0,-1,1,0,0,W)"));
  assert.ok(source.includes("ctx.transform(0,1,-1,0,H,0)"));
  for (const seat of [1, 3]) {
    const fit = fitAt(source, 1920, 1080, false, seat);
    assert.equal(fit.logicalWidth, fit.arena.height);
    assert.equal(fit.logicalHeight, fit.arena.width);
    assert.ok(fit.width < fit.height);
  }
});
