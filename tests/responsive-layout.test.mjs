import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = ["../src/index.mjs", "../src/multi.mjs"];

function fitAt(source, viewportWidth, viewportHeight) {
  const start = source.indexOf("function fit(){");
  const end = source.indexOf("}\\nfunction resize(){", start);
  assert.ok(start >= 0 && end > start, "missing board fit function");

  const body = source.slice(start, end + 1).replaceAll("\\n", "\n");
  const properties = new Map();
  const wrap = { style: {
    setProperty: (name, value) => properties.set(name, value),
  } };
  const window = { innerWidth: viewportWidth, innerHeight: viewportHeight, visualViewport: null };
  new Function("window", "wrap", body + "\nreturn fit;")(window, wrap)();

  return {
    width: parseFloat(wrap.style.width),
    height: parseFloat(wrap.style.height),
    sidebar: parseFloat(properties.get("--sidebar-width")),
    gap: parseFloat(properties.get("--desktop-gap")),
    offset: parseFloat(properties.get("--desktop-offset")),
  };
}

for (const page of pages) {
  const source = readFileSync(new URL(page, import.meta.url), "utf8");

  test(page + ": desktop lobby sits beside the playfield", () => {
    assert.match(source, /@media \\(min-width:1024px\\) and \\(min-aspect-ratio:4\\/3\\)/);
    assert.match(source, /body:has\\(#panel:not\\(\\[hidden\\]\\)\\) #wrap/);
    assert.match(source, /left:calc\\(100% \\+ var\\(--desktop-gap\\)\\)/);
  });

  test(page + ": preserves 9:16 board and fits laptop through ultrawide", () => {
    for (const [vw, vh] of [[1024, 768], [1280, 720], [1366, 768], [1920, 1080], [3840, 2160]]) {
      const size = fitAt(source, vw, vh);
      assert.ok(Math.abs(size.width / size.height - 9 / 16) < 0.003, vw + " aspect ratio");
      assert.ok(size.width + size.sidebar + size.gap + 48 <= vw, vw + " board/sidebar width");
      assert.ok(size.height + 48 <= vh, vw + " board height");
      assert.equal(size.offset, Math.round((size.sidebar + size.gap) / 2));
    }
  });

  test(page + ": does not reserve desktop sidebar space on mobile", () => {
    for (const [vw, vh] of [[320, 568], [375, 812], [768, 1024]]) {
      const size = fitAt(source, vw, vh);
      assert.ok(size.width <= vw && size.height <= vh);
      assert.ok(Math.abs(size.width / size.height - 9 / 16) < 0.003);
      assert.ok(size.height > vh - 2 || size.width > vw - 2);
    }
  });
}
