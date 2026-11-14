import assert from "node:assert/strict";
import test from "node:test";
import { icons, manifest, serviceWorker, withPwa } from "../src/pwa.js";

test("manifest provides installable standalone metadata and real PNG icons", () => {
  const data = JSON.parse(manifest);
  assert.equal(data.start_url, "/");
  assert.equal(data.scope, "/");
  assert.equal(data.display, "standalone");
  assert.equal(data.orientation, "any");
  for (const item of data.icons) {
    const image = Buffer.from(icons[item.src], "base64");
    assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const [width, height] = item.sizes.split("x").map(Number);
    assert.equal(image.readUInt32BE(16), width);
    assert.equal(image.readUInt32BE(20), height);
  }
});

test("PWA tags are added to every page without duplicate theme metadata", () => {
  const result = withPwa('<html><head><title>Game</title></head><body></body></html>');
  assert.match(result, /rel="manifest"/);
  assert.match(result, /apple-touch-icon/);
  assert.match(result, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.equal((result.match(/name="theme-color"/g) || []).length, 1);
  const alreadyThemed = withPwa('<html><head><meta name="theme-color"></head></html>');
  assert.equal((alreadyThemed.match(/name="theme-color"/g) || []).length, 1);
});

test("service worker caches only the solo shell, leaving API and live rooms online", () => {
  assert.match(serviceWorker, /cache\.addAll\(SHELL\)/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /url\.pathname === "\/"/);
  assert.doesNotMatch(serviceWorker, /SHELL = .*multiplayer/);
});
