import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = ["../src/index.mjs", "../src/multi.mjs"];
const viewports = [
  [320, 568], [375, 812], [768, 1024], [1024, 768],
  [1280, 800], [1366, 768], [1920, 1080], [2560, 1440],
  [3840, 2160], [7680, 4320],
];

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
  new Function("window", "wrap", "document", body + "\nreturn fit;")(window, wrap, document)();

  return {
    width: parseFloat(wrap.style.width),
    height: parseFloat(wrap.style.height),
    sidebar: parseFloat(properties.get("--sidebar-width")),
    gap: parseFloat(properties.get("--desktop-gap")),
    edge: parseFloat(properties.get("--edge")),
    sidecar,
  };
}

for (const page of pages) {
  const source = readFileSync(new URL(page, import.meta.url), "utf8");

  test(page + ": gameplay uses nearly the full viewport on all devices", () => {
    for (const [vw, vh] of viewports) {
      const size = fitAt(source, vw, vh, false);
      assert.equal(size.sidecar, false);
      assert.equal(size.width + size.edge * 2, vw);
      assert.equal(size.height + size.edge * 2, vh);
      assert.equal(size.sidebar, 0);
      assert.ok(size.width > 0 && size.height > 0);
    }
  });

  test(page + ": lobby docks beside the game on landscape laptop, desktop and TV", () => {
    for (const [vw, vh] of [[1024, 768], [1280, 800], [1366, 768], [1920, 1080], [3840, 2160]]) {
      const size = fitAt(source, vw, vh, true);
      assert.equal(size.sidecar, true);
      assert.ok(size.sidebar >= 320);
      assert.equal(size.width + size.sidebar + size.gap + size.edge * 2, vw);
      assert.equal(size.height + size.edge * 2, vh);
    }
  });

  test(page + ": portrait and narrow tablet lobbies remain within the viewport", () => {
    for (const [vw, vh] of [[320, 568], [375, 812], [768, 1024], [820, 1180]]) {
      const size = fitAt(source, vw, vh, true);
      assert.equal(size.sidecar, false);
      assert.equal(size.width + size.edge * 2, vw);
      assert.equal(size.height + size.edge * 2, vh);
    }
  });

  test(page + ": renders at independent axes with pixel cap and circular ball graphics", () => {
    assert.ok(source.includes("scaleX = width / W; scaleY = height / H"));
    assert.ok(source.includes("Math.sqrt(8000000 / Math.max(1, r.width * r.height))"));
    assert.ok(source.includes("context.ellipse(x, y, radius * correction, radius / correction"));
    assert.ok(source.includes("layoutObserver.observe(element,{attributes:true,attributeFilter:['hidden']})"));
  });

  test(page + ": visible focus targets and mobile touch targets", () => {
    assert.ok(source.includes("@media (pointer:coarse)"));
    assert.ok(source.includes("min-height:44px"));
    assert.ok(source.includes("#wrap.sidecar"));
  });
}
