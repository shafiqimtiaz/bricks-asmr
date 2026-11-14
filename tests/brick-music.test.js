import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createBrickMusic } from "../src/brick-music.js";
import { browserCoreSource, soloCoreSource } from "../src/game-core.js";
import { soloHtml, multiHtml, serverSource, loadServer, makeRoom, roomInstance } from "./helpers.js";

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

test("MIDI notes deepen as lives decrease without changing melodies or timing", () => {
  const music = createBrickMusic();
  const noteAt = lives => {
    music.reset("life-pitch");
    music.setLives(lives, 5);
    return music.next();
  };
  const notes = [5, 4, 3, 2, 1, 0].map(noteAt);
  for (let i = 1; i < notes.length; i++) {
    assert.ok(notes[i].frequency < notes[i - 1].frequency);
    assert.equal(notes[i].wave, notes[0].wave);
    assert.equal(notes[i].duration, notes[0].duration);
    assert.equal(notes[i].volume, notes[0].volume);
  }
  assert.ok(Math.abs(notes[0].frequency / notes.at(-1).frequency - 2) < .001);
  assert.deepEqual(noteAt(5), notes[0]);
  music.setLives(0, 5);
  music.reset("life-pitch");
  assert.deepEqual(music.next(), notes[0]);
});

test("infinite descent deepens the melody while combining with lives", () => {
  const music = createBrickMusic();
  const noteAt = (lives, rows) => {
    music.reset("infinite-pitch");
    music.setLives(lives, 5);
    music.setDepth(rows);
    return music.next();
  };
  const normal = noteAt(5, 0);
  const descended = noteAt(5, 8);
  const deeper = noteAt(5, 16);
  const combined = noteAt(2, 16);
  const lowest = noteAt(0, 100);
  assert.ok(normal.frequency > descended.frequency);
  assert.ok(descended.frequency > deeper.frequency);
  assert.ok(deeper.frequency > combined.frequency);
  assert.ok(combined.frequency > lowest.frequency);
  assert.ok(Math.abs(normal.frequency / lowest.frequency - Math.pow(2, 18 / 12)) < .001);
  assert.equal(lowest.wave, normal.wave);
  assert.equal(lowest.duration, normal.duration);
  assert.deepEqual(noteAt(5, 0), normal);
  music.setDepth(12);
  music.reset("infinite-pitch");
  assert.deepEqual(music.next(), normal);
});

test("multiplayer snapshots include actual infinite descent progress", () => {
  const server = loadServer();
  const room = makeRoom(server, "infinite", 2);
  const instance = roomInstance(server, room);
  assert.equal(instance.snapshot(false).descentRows, 0);
  room.sim.descent.rows = 6;
  assert.equal(instance.snapshot(false).descentRows, 6);
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
    assert.match(html, /brickMusic\.hit\((?:soundKit|soundOn\?soundKit:null)(?:,pan)?\)/);
    assert.match(html, /brickMusic\.reset\(/);
  }
  assert.match(soloHtml, /brickMusic\.reset\(seed\)/);
  assert.match(soloHtml, /brickMusic\.setLives\(lives, MAX_LIVES\)/);
  assert.match(soloHtml, /brickMusic\.setDepth\(S\.descent\?\.rows \|\| 0\)/);
  assert.match(multiHtml, /brickMusic\.setLives\(mine\.lives,s\.mode===\"versus\"\?6:3\*s\.players\.length\)/);
  assert.doesNotMatch(soloHtml, /hbT|danger vignette|rgba\(255,0,40/);
  assert.match(multiHtml, /brickMusic\.reset\(s\.seed/);
  assert.match(multiHtml, /brickMusic\.setDepth\(s\.mode===\"infinite\"\?s\.descentRows:0\)/);
  assert.match(serverSource, /descentRows:S\?\.descent\?\.rows\|\|0/);
  for (const bundle of [soloCoreSource, browserCoreSource]) {
    assert.equal(runInNewContext(bundle + "\ntypeof createBrickMusic"), "function");
    assert.equal(runInNewContext(bundle + "\ncreateBrickMusic().count"), 10);
  }
});
