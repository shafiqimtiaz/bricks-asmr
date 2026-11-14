import assert from "node:assert/strict";
import test from "node:test";
import { parseBrickMidi, createBrickSequencer } from "../src/brick-music.js";
import { browserCoreSource, soloCoreSource } from "../src/game-core.js";
import { soloHtml, multiHtml } from "./helpers.js";
import { runInNewContext } from "node:vm";

function midi(events, format = 0) {
  const header = [77, 84, 104, 100, 0, 0, 0, 6, 0, format, 0, 1, 0, 96];
  const length = events.length;
  const track = [77, 84, 114, 107, (length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255];
  return Uint8Array.from([...header, ...track, ...events]);
}

test("MIDI melody ignores drums, silent note-ons, note-offs and simultaneous chord notes", () => {
  const data = midi([
    0, 0x99, 36, 127,
    0, 0x90, 60, 100,
    0, 0x90, 64, 100,
    48, 0x80, 60, 0,
    0, 0x90, 67, 100,
    24, 69, 100,
    24, 69, 0,
    0, 0xff, 0x2f, 0
  ]);
  assert.deepEqual(parseBrickMidi(data), [64, 67, 69]);
});

test("MIDI parser rejects invalid audio and unsupported format", () => {
  assert.throws(() => parseBrickMidi(new Uint8Array([1, 2, 3])), /Not a MIDI/);
  assert.throws(() => parseBrickMidi(midi([0, 0xff, 0x2f, 0], 2)), /Unsupported MIDI/);
  assert.throws(() => parseBrickMidi(midi([0, 0x99, 36, 100, 0, 0xff, 0x2f, 0])), /No instrumental/);
});

test("one brick advances one note, loops and resets on new board", () => {
  const player = createBrickSequencer();
  assert.equal(player.next(), null);
  assert.equal(player.load(midi([
    0, 0x90, 60, 100,
    48, 62, 100,
    48, 64, 100,
    0, 0xff, 0x2f, 0
  ])), 3);
  const first = player.next();
  const second = player.next();
  assert.notEqual(first.frequency, second.frequency);
  player.next();
  assert.equal(player.next().frequency, first.frequency);
  player.reset();
  assert.equal(player.next().frequency, first.frequency);
  player.clear();
  assert.equal(player.next(), null);
});

test("solo and multiplayer ship ten titled MIDI choices, with one note per brick break", () => {
  const ids = ["toxic", "billie-jean", "save-your-tears", "bad-romance", "gangnam-style",
    "baby", "i-want-it-that-way", "what-makes-you-beautiful", "as-it-was", "cant-stop-the-feeling"];
  for (const html of [soloHtml, multiHtml]) {
    for (const id of ids) assert.match(html, new RegExp('value="' + id + '"'));
    assert.match(html, /brickMusic\.next\(\)\|\|soloBrickNote/);
    assert.match(html, /brickMusic\.reset\(\)/);
    assert.match(html, /id="midiFile"/);
  }
  for (const bundle of [soloCoreSource, browserCoreSource]) {
    assert.equal(runInNewContext(bundle + "\ntypeof createBrickMusic"), "function");
    assert.equal(runInNewContext(bundle + "\ntypeof parseBrickMidi"), "function");
  }
});
