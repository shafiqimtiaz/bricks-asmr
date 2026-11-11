import { readFileSync } from "node:fs";
import * as core from "../src/game-core.mjs";

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
  return new Function("DurableObject", "core",
    `const {${Object.keys(core).join(",")}}=core;${body}
return {assignedSides,assignSides,startRound,advanceBall,grantPower,replenishBalls,spawnPlayerBall,BrickRoom};`
  )(class {}, core);
}
