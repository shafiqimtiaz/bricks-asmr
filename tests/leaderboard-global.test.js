import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { soloHtml, multiHtml, soloWorker } from "./helpers.js";

const leaderboardHtml = readFileSync(new URL("../src/leaderboard.html", import.meta.url), "utf8");
const source = soloWorker.slice(soloWorker.indexOf("function json("), soloWorker.indexOf("export default"));
const api = new Function(source + "\nreturn api;")();

test("only CRT is selectable in Solo, Multiplayer and world rankings", () => {
  for (const html of [soloHtml, multiHtml]) {
    assert.match(html, /const style = 'vintage'/);
    assert.doesNotMatch(html, /id="sty"|STYLES|brick-asmr-style/);
  }
  assert.doesNotMatch(leaderboardHtml, /data-theme-btn|VISUAL MODE|id="board"|id="today"/);
  assert.match(leaderboardHtml, /scope=world&offset=/);
});

test("player renaming uses an in-game modal rather than a browser prompt", () => {
  assert.match(soloHtml, /id="nameModal" role="dialog" aria-modal="true"/);
  assert.match(soloHtml, /id="nameForm"/);
  assert.match(soloHtml, /id="nameCancel"/);
  assert.doesNotMatch(soloHtml, /prompt\('Public leaderboard name/);
});

test("the global leaderboard returns every saved score across board keys and pages results", async () => {
  const entries = Array.from({ length: 51 }, (_, i) => ({
    boardKey: "seed" + i + (i % 2 ? "-v4-clean" : "-v4-vintage"),
    playerId: "player" + i,
    name: "Player " + i,
    timeMs: 10000 + i
  }));
  const queries = [];
  const db = {
    withSession() { return this; },
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { this.args = args; return this; },
        async all() {
          queries.push(sql);
          return { results: entries.slice(this.args[0], this.args[0] + 51) };
        },
        async first() { return { n: 51 }; }
      };
      return stmt;
    }
  };
  const env = { DB: db };
  for (const [offset, expected, more] of [[0, 50, true], [50, 1, false]]) {
    const url = new URL("https://example.com/api/leaderboard?scope=world&offset=" + offset);
    const response = await api(new Request(url), env, url);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.entries.length, expected);
    assert.equal(body.entries[0].boardKey, entries[offset].boardKey);
    assert.equal(body.totalPlayers, 51);
    assert.equal(body.hasMore, more);
  }
  assert.ok(queries.every(sql => /FROM leaderboard_times WHERE board_key GLOB best_ms ASC/.test(sql)));
  assert.ok(queries.every(sql => !/WHERE board_key=/.test(sql)));
});

test("saving a clear persists the score and updates that player's display name", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      const stmt = {
        bind(...args) { this.args = args; return this; },
        async run() { calls.push({ sql, args: this.args }); }
      };
      return stmt;
    }
  };
  const url = new URL("https://example.com/api/leaderboard");
  const response = await api(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "abc123-v4-vintage", playerId: "123e4567-e89b-12d3-a456-426614174000", name: "New Name", timeMs: 12000 })
  }), { DB: db }, url);
  assert.equal(response.status, 201);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO leaderboard_times/);
  assert.match(calls[1].sql, /UPDATE leaderboard_times SET player_name=/);
  assert.deepEqual(calls[1].args, ["New Name", "123e4567-e89b-12d3-a456-426614174000", "New Name"]);
});
