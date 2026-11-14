import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createBrickMusic } from "../src/brick-music.js";
import { browserCoreSource, soloCoreSource } from "../src/game-core.js";
import { soloHtml, multiHtml } from "./helpers.js";

test("ten built-in public-domain tunes play without files or selection", () => {
  const music = createBrickMusic();
  assert.equal(music.count, 10);
  for (let i = 0; i < 100; i++) {
    const title = music.reset("seed-" + i);
    assert.equal(typeof title, "string");
    assert.ok(title.length);
    const note = music.next();
    assert.ok(note.frequency >= 220 && note.frequency <= 2000);
    assert.ok(note.duration > 0 && note.duration < .5);
    assert.ok(["triangle", "sine", "square"].includes(note.wave));
  }
});

test("same board or multiplayer round chooses the same tune, with varied seeds", () => {
  const a = createBrickMusic(), b = createBrickMusic();
  const choices = new Set();
  for (let n = 0; n < 100; n++) {
    const key = "board-" + n + ":round-1";
    const first = a.reset(key), second = b.reset(key);
    assert.equal(first, second);
    assert.deepEqual(a.next(), b.next());
    choices.add(first);
  }
  assert.equal(choices.size, 10);
});

test("each hit plays the next note, loops at the end, and restarts on retry", () => {
  const music = createBrickMusic();
  music.reset("example-board");
  const first = music.next();
  const sequence = [first];
  for (let i = 1; i < music.length; i++) sequence.push(music.next());
  assert.deepEqual(music.next(), first);
  music.reset("example-board");
  assert.deepEqual(music.next(), first);
  assert.ok(sequence.some(note => note.frequency !== first.frequency));
});

test("rapid combos schedule distinct notes instead of simultaneous noise", () => {
  const music = createBrickMusic();
  music.reset("combo");
  const output = [];
  const kit = { context: { currentTime: 3 }, blip: (...args) => output.push(args) };
  for (let i = 0; i < 100; i++) music.hit(kit);
  assert.ok(output.length >= 3 && output.length <= 12);
  for (let i = 1; i < output.length; i++) {
    assert.ok(output[i][4] > output[i - 1][4]);
  }
  assert.ok(output.every(note => note[4] <= .5));
  kit.context.currentTime = 4;
  music.hit(kit);
  assert.equal(output.at(-1)[4], 0);
  const count = output.length;
  music.hit(null);
  assert.equal(output.length, count);
});

test("solo and multiplayer use the same automatic music source", () => {
  for (const html of [soloHtml, multiHtml]) {
    assert.doesNotMatch(html, /id="musicTrack"|id="midiFile"|id="loadMidi"|midiPick|LOAD LICENSED MIDI/);
    assert.match(html, /brickMusic\.hit\((?:soundKit|soundOn\?soundKit:null)\)/);
    assert.match(html, /brickMusic\.reset\(/);
  }
  assert.match(soloHtml, /brickMusic\.reset\(seed\)/);
  assert.match(multiHtml, /brickMusic\.reset\(s\.seed/);
  for (const bundle of [soloCoreSource, browserCoreSource]) {
    assert.equal(runInNewContext(bundle + "\ntypeof createBrickMusic"), "function");
    assert.equal(runInNewContext(bundle + "\ncreateBrickMusic().count"), 10);
  }
});
