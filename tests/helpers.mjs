import { readFileSync } from "node:fs";
import * as core from "../src/game-core.mjs";
import * as engine from "../src/engine.mjs";

const read = name => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

export const soloHtml = read("solo.html");
export const multiHtml = read("multiplayer.html");
export const soloWorker = read("index.mjs");
export const serverSource = read("multi.mjs");

// Evaluates the room module without the Cloudflare runtime so its game logic can be driven directly.
export function loadServer() {
  const body = serverSource
    .slice(0, serverSource.indexOf("export default"))
    .replace(/^import .*$/gm, "")
    .replace("export class BrickRoom", "class BrickRoom");
  return new Function("DurableObject", "core", "engine",
    `const {${Object.keys(core).join(",")}}=core;const {${Object.keys(engine).join(",")}}=engine;${body}
return {assignedSides,assignSides,startRound,eliminate,E,BrickRoom};`
  )(class {}, core, engine);
}

// A started room (coop or versus) on the shared engine, with every player online.
export function makeRoom(server, mode = "coop", count = 2, set = "clean") {
  const players = Array.from({ length: count }, (_, i) =>
    ({ id: "p" + i, token: "token-" + i, name: "Player" + i, seat: -1, pos: .5, online: true, lastSeq: -1, lastInputAt: 0 }));
  server.assignSides(players);
  const room = { code: "BRICKS", players, status: "waiting", round: 0, mode, hostId: "p0", arena: core.arenaLayout(9 / 16), lastActivity: Date.now() };
  server.startRound(room, set);
  return room;
}

// A BrickRoom around a room object, with no Cloudflare runtime: sockets are plain objects that record what they receive.
export function roomInstance(server, room, { live = room.players.map(p => p.id), sockets = [] } = {}) {
  const inst = Object.create(server.BrickRoom.prototype);
  Object.assign(inst, { room, loop: null, pending: [], evCount: {}, sent: null, lastTick: 0, lastSave: 0,
    ctx: { getWebSockets: () => sockets, storage: { put: async () => {}, delete: async () => {} } } });
  inst.liveIds = () => new Set(live);
  return inst;
}
