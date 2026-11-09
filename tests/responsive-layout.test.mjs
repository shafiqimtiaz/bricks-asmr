import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = ["../src/index.mjs", "../src/multi.mjs"];
const viewports = [
  [320, 568], [375, 812], [768, 1024], [1024, 768],
  [1280, 800], [1366, 768], [1920, 1080], [2560, 1440],
  [3840, 2160], [7680, 4320],
];
const ratio = 360 / 640;

function fitAt(source, viewportWidth, viewportHeight, panelOpen) {
  const start = source.indexOf("function fit(){");
  const end = source.indexOf("}\\nfunction resize(){", start);
  assert.ok(start >= 0 && end > start, "missing fit function");

  const body = source.slice(start, end + 1).replaceAll("\\n", "\n");
  const properties = new Map();
  let sidecar = false;
  const wrap = {
    classList: { toggle: (name, enabled) => {
      assert.equal(name, "sidecar");
      sidecar = enabled;
    } },
    style: { setProperty: (name, value) => properties.set(name, value) },
  };
  const window = {
    innerWidth: viewportWidth, innerHeight: viewportHeight, visualViewport: null,
  };
  const document = {
    getElementById: (id) => id === "panel" ? { hidden: !panelOpen } : null,
  };
  new Function("window", "wrap", "document", "W", "H", body + "\nreturn fit;")(
    window, wrap, document, 360, 640
  )();

  return {
    width: parseFloat(wrap.style.width),
    height: parseFloat(wrap.style.height),
    sidebar: parseFloat(properties.get("--sidebar-width")),
    gap: parseFloat(properties.get("--desktop-gap")),
    edge: parseFloat(properties.get("--edge")),
    stageLeft: parseFloat(properties.get("--stage-left")),
    sidecar,
  };
}

for (const page of pages) {
  const source = readFileSync(new URL(page, import.meta.url), "utf8");

  test(page + ": game never stretches beyond its original 9:16 aspect ratio", () => {
    for (const [vw, vh] of viewports) {
      for (const open of [false, true]) {
        const size = fitAt(source, vw, vh, open);
        assert.ok(Math.abs(size.width / size.height - ratio) < 0.000001, vw + "x" + vh);
        assert.ok(size.width + size.edge * 2 <= vw + 0.01, "width fits " + vw);
        assert.ok(size.height + size.edge * 2 <= vh + 0.01, "height fits " + vh);
        assert.ok(size.width > 0 && size.height > 0);
      }
    }
  });

  test(page + ": game is centered when playing without a lobby", () => {
    for (const [vw, vh] of viewports) {
      const size = fitAt(source, vw, vh, false);
      assert.equal(size.sidecar, false);
      assert.equal(size.sidebar, 0);
      assert.ok(Math.abs(size.stageLeft - (vw - size.width) / 2) < 0.01);
      assert.ok(
        Math.abs(size.height - (vh - 2 * size.edge)) < 0.01 ||
        Math.abs(size.width - (vw - 2 * size.edge)) < 0.01
      );
    }
  });

  test(page + ": wide-screen lobby and proportional game are centered together", () => {
    for (const [vw, vh] of [[1024, 768], [1280, 800], [1366, 768], [1920, 1080], [3840, 2160]]) {
      const size = fitAt(source, vw, vh, true);
      assert.equal(size.sidecar, true);
      assert.ok(size.sidebar >= 320);
      assert.ok(Math.abs(size.stageLeft * 2 + size.width + size.gap + size.sidebar - vw) < 0.01);
      assert.ok(size.stageLeft >= size.edge);
    }
  });

  test(page + ": portrait and narrow tablet lobbies remain overlaid without overflow", () => {
    for (const [vw, vh] of [[320, 568], [375, 812], [768, 1024], [820, 1180]]) {
      const size = fitAt(source, vw, vh, true);
      assert.equal(size.sidecar, false);
      assert.ok(size.width + 2 * size.edge <= vw + 0.01);
      assert.ok(size.height + 2 * size.edge <= vh + 0.01);
    }
  });

  test(page + ": canvas dimensions preserve game coordinates with pixel cap", () => {
    assert.ok(source.includes("const pixelScale = Math.min(r.width / W, r.height / H) * density"));
    assert.ok(source.includes("Math.round(W * pixelScale)"));
    assert.ok(source.includes("Math.round(H * pixelScale)"));
    assert.ok(source.includes("Math.sqrt(4000000 / Math.max(1, r.width * r.height))"));
    assert.ok(source.includes("context.ellipse(x, y, radius * correction, radius / correction"));
    assert.ok(source.includes("layoutObserver.observe(element,{attributes:true,attributeFilter:['hidden']})"));
    assert.ok(source.includes("left:var(--stage-left)!important"));
  });

  test(page + ": accessible keyboard and touch controls remain available", () => {
    assert.ok(source.includes("@media (pointer:coarse)"));
    assert.ok(source.includes("min-height:44px"));
    assert.ok(source.includes("#wrap.sidecar"));
  });
}
