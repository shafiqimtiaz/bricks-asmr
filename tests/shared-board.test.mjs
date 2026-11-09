import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/multi.mjs", import.meta.url), "utf8");
const server = source.slice(0, source.indexOf("const MULTIPLAYER_HTML="))
  .replace(/^import .*?;\s*/, "")
  .replace("export class BrickRoom", "class BrickRoom");
const { bricks, assignedSides, assignSides, startRound, advanceBall, grantPower, BrickRoom } =
  new Function("DurableObject", server + ";return {bricks,assignedSides,assignSides,startRound,advanceBall,grantPower,BrickRoom};")(class {});
const htmlStart = source.indexOf("const MULTIPLAYER_HTML=") + "const MULTIPLAYER_HTML=".length;
const htmlEnd = source.indexOf(";\nexport default", htmlStart);
const html = JSON.parse(source.slice(htmlStart, htmlEnd));

test("there is one board and each occupied player gets a unique side", () => {
  const expected = { 1: [0], 2: [0, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3] };
  for (const count of [1, 2, 3, 4]) {
    const players = Array.from({ length: count }, (_, index) =>
      ({ id: "player-" + index, seat: -1, pos: .5, lives: 3, online: true }));
    assignSides(players);
    assert.deepEqual(players.map(player => player.seat), expected[count]);
    assert.deepEqual(assignedSides(count), expected[count]);
  }
  assert.equal((html.match(/<div id="wrap">/g) || []).length, 1);
  assert.equal((html.match(/id="c"/g) || []).length, 1);
});

test("multiplayer uses Solo's grid size and a deterministic level", () => {
  const first = bricks("TEST123", 1);
  assert.deepEqual(first, bricks("TEST123", 1));
  assert.equal(first.hp.length, 58 * 64);
  assert.equal(first.colors.length, first.hp.length);
  assert.equal(first.powerups.length, first.hp.length);
  assert.ok(first.palette.length === 16);
  assert.equal(first.total, [...first.hp].filter(digit => digit !== "0").length);
  assert.notEqual(first.hp, bricks("TEST123", 2).hp);
});

function roomForPlayers(count = 4) {
  const players = Array.from({ length: count }, (_, i) =>
    ({ id: "p" + i, seat: -1, pos: .5, lives: 3, score: 0, online: true, lastSeq: -1, lastInputAt: 0 }));
  assignSides(players);
  const room = { code: "BRICKS", players, status: "waiting", round: 0 };
  startRound(room);
  return room;
}

test("all four active paddles bounce their own ball", () => {
  for (const side of [0, 1, 2, 3]) {
    const room = roomForPlayers();
    const player = room.players.find(p => p.seat === side);
    player.pos = side === 0 || side === 2 ? .5 : 1;
    const ball = side === 0
      ? { x: 180, y: 531, vx: 0, vy: 330, owner: null }
      : side === 2
        ? { x: 180, y: 39, vx: 0, vy: -330, owner: null }
        : side === 1
          ? { x: 15, y: 500, vx: -330, vy: 0, owner: null }
          : { x: 345, y: 500, vx: 330, vy: 0, owner: null };
    room.balls = [ball];
    advanceBall(room, ball, .01);
    assert.equal(player.score, 2, "side " + side + " hit");
    assert.equal(ball.owner, player.id);
    assert.ok(side === 0 ? ball.vy < 0 : side === 2 ? ball.vy > 0 : side === 1 ? ball.vx > 0 : ball.vx < 0);
  }
});

test("a missed occupied paddle loses a life, an empty side acts as a wall", () => {
  const room = roomForPlayers(2);
  const top = room.players.find(p => p.seat === 2);
  const miss = { x: 30, y: 39, vx: 0, vy: -330, owner: null };
  room.balls = [miss];
  advanceBall(room, miss, .01);
  assert.equal(top.lives, 2);
  const left = { x: 15, y: 500, vx: -330, vy: 0, owner: null };
  room.balls = [left];
  advanceBall(room, left, .01);
  assert.ok(left.vx > 0);
  assert.equal(room.players.length, 2);
});

test("socket identity and sequence prevent controlling another paddle", async () => {
  const room = roomForPlayers(2);
  const handler = { room, loop: {}, ensureLoop() { throw Error("unexpected loop"); } };
  const socket = { deserializeAttachment: () => ({ id: "p0" }), send() {}, close() {} };
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({
    type: "paddle-input", version: 1, seq: 2, pos: .7, playerId: "p1"
  }));
  assert.equal(room.players[0].pos, .7);
  assert.equal(room.players[1].pos, .5);
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({
    type: "paddle-input", version: 1, seq: 1, pos: .2
  }));
  assert.equal(room.players[0].pos, .7);
});

test("multiplayer renderer parses and Solo/leaderboard routes remain intact", () => {
  const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /paintTiles\(s\?\.board\)/);
  assert.match(js, /seq:\+\+inputSeq/);
  const solo = readFileSync(new URL("../src/index.mjs", import.meta.url), "utf8");
  assert.match(solo, /path==='\/api\/leaderboard'/);
  assert.match(solo, /const GAME=/);
});


test("a missed ball costs one life without deleting a surviving multiball", () => {
  const room = roomForPlayers(2);
  const top = room.players.find(p => p.seat === 2);
  const miss = { x: 30, y: 39, vx: 0, vy: -330, owner: null };
  const surviving = { x: 180, y: 480, vx: 130, vy: -260, owner: "p0" };
  room.balls = [miss, surviving];
  advanceBall(room, miss, .01);
  assert.equal(top.lives, 2);
  assert.equal(room.balls.length, 1);
  assert.equal(room.balls[0], surviving);
  assert.equal(room.lastEvent.type, "MISS");
});

test("bricks trigger real power-ups and score in the shared authoritative state", () => {
  const room = roomForPlayers(2);
  const index = 55 * 58 + 29;
  room.board.hp = room.board.hp.slice(0, index) + "1" + room.board.hp.slice(index + 1);
  room.board.powerups = room.board.powerups.slice(0, index) + "b" + room.board.powerups.slice(index + 1);
  const initial = room.board.remaining;
  const ball = { x: 183, y: 382, vx: 0, vy: -330, owner: "p0" };
  room.balls = [ball];
  advanceBall(room, ball, .02);
  assert.equal(room.board.hp[index], "0");
  assert.equal(room.board.remaining, initial - 1);
  assert.equal(room.balls.length, 3);
  assert.equal(room.lastEvent.type, "STARTER SPLIT");
  assert.ok(room.players[0].score >= 10);
});

test("power-ups extend a bounded timer and expose active buffs", () => {
  const room = roomForPlayers(2);
  const ball = room.balls[0];ball.owner = "p0";
  const setPower = (kind) => {
    room.board.powerups = kind.toString(16) + room.board.powerups.slice(1);
    grantPower(room, 0, ball);
  };
  setPower(3);
  assert.ok(room.effects.wideUntil > Date.now());
  setPower(4);
  assert.ok(room.effects.pierceUntil > Date.now());
  setPower(8);
  assert.ok(room.effects.slowUntil > Date.now());
  setPower(7);
  assert.ok(room.effects.hyperUntil > Date.now());
  for (let i = 0; i < 12; i++) setPower(10);
  assert.equal(room.endsAt, room.startedAt + 150000);
});

test("wider paddles remain inside the arena boundaries", () => {
  const room = roomForPlayers(4),p = room.players[0];
  p.pos = 0;
  room.effects.wideUntil = Date.now() + 10000;
  const ball = { x: 50, y: 531, vx: 0, vy: 330, owner: null };
  room.balls = [ball];
  advanceBall(room, ball, .01);
  assert.equal(p.lives, 3);
  assert.equal(ball.owner, p.id);
  assert.ok(ball.vy < 0);
});

test("frequent snapshots omit immutable map data but send brick HP changes", () => {
  const room = roomForPlayers(4),packets = [];
  const socket = { readyState: 1, deserializeAttachment: () => ({ id: "p0" }),
    send(payload) { packets.push(JSON.parse(payload)); } };
  const instance = {
    room,
    ctx: { getWebSockets: () => [socket] },
    lastBroadcastCode: null,
    lastBroadcastRound: null,
    lastBroadcastHP: null,
    liveIds: () => new Set(["p0"]),
    snapshot(includeBoard) { return BrickRoom.prototype.snapshot.call(this, includeBoard); }
  };
  BrickRoom.prototype.broadcast.call(instance);
  assert.equal(packets[0].state.board.hp.length, 58 * 64);
  BrickRoom.prototype.broadcast.call(instance);
  assert.equal(packets[1].state.board, undefined);
  assert.ok(JSON.stringify(packets[1]).length < 1500);
  const i = room.board.hp.indexOf("1");
  assert.ok(i >= 0);
  room.board.hp = room.board.hp.slice(0, i) + "0" + room.board.hp.slice(i+1);
  room.board.remaining--;
  BrickRoom.prototype.broadcast.call(instance);
  assert.equal(packets[2].state.board.hp[i], "0");
  assert.equal(packets[2].state.board.colors, undefined);
  startRound(room);
  BrickRoom.prototype.broadcast.call(instance);
  assert.equal(packets[3].state.board.colors.length, 58 * 64);
});

test("a timed out match finishes and halts the simulation", () => {
  const room = roomForPlayers(2);
  room.endsAt = Date.now() - 1;
  let stopped = false;
  BrickRoom.prototype.step.call({ room, stopLoop() { stopped = true; }, save: async () => {} }, .05, Date.now());
  assert.equal(room.status, "finished");
  assert.ok(stopped);
});

test("unknown WebSocket protocol versions and stale moves do not change paddles", async () => {
  const room = roomForPlayers(2);
  const handler = { room, loop: {}, ensureLoop() { throw Error("Unexpected ensureLoop"); } };
  const socket = { deserializeAttachment: () => ({ id: "p0" }), send() {}, close() {} };
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({ type:"paddle-input", version:2, seq:1, pos:.9 }));
  assert.equal(room.players[0].pos,.5);
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({ type:"paddle-input", version:1, seq:1, pos:.8 }));
  assert.equal(room.players[0].pos,.8);
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({ type:"paddle-input", version:1, seq:0, pos:.1 }));
  assert.equal(room.players[0].pos,.8);
});


test("CRT and Vapor canvases both receive direct pointer input", () => {
  assert.match(html, /for\(const canvas of \[cv,gcv\]\)/);
  assert.match(html, /#c,#g\{touch-action:none\}/);
  assert.match(html, /target=event.currentTarget/);
});

test("shared countdown is visible but physics and the timer wait three seconds", () => {
  const room = roomForPlayers(2);
  assert.ok(room.startedAt > Date.now());
  assert.equal(room.endsAt - room.startedAt, 90000);
  const before = { ...room.balls[0] };
  const handler = { room, stopLoop() {}, save: async () => {} };
  BrickRoom.prototype.step.call(handler, .05, room.startedAt - 1000);
  assert.deepEqual(room.balls[0], before);
  BrickRoom.prototype.step.call(handler, .05, room.startedAt + 50);
  assert.ok(room.balls[0].x !== before.x || room.balls[0].y !== before.y);
  assert.match(html, /GET READY/);
});

test("all four authenticated players receive the same authoritative world", async () => {
  const room = roomForPlayers(4), packets = new Map();
  const sockets = room.players.map(p => ({
    readyState: 1,
    deserializeAttachment: () => ({id:p.id}),
    send(data) { packets.set(p.id, JSON.parse(data)); },
    close() {}
  }));
  const handler = {
    room, ctx:{ getWebSockets:()=>sockets },
    loop: {}, lastBroadcastCode:null, lastBroadcastRound:null, lastBroadcastHP:null,
    liveIds:()=>new Set(room.players.map(p=>p.id)),
    snapshot(includeBoard) {return BrickRoom.prototype.snapshot.call(this,includeBoard);}
  };
  for(const [i,ws] of sockets.entries()){
    await BrickRoom.prototype.webSocketMessage.call(handler,ws,JSON.stringify({
      type:"paddle-input",version:1,seq:1,pos:.15+i*.2
    }));
  }
  for(const [i,p] of room.players.entries())assert.ok(Math.abs(p.pos-(.15+i*.2))<1e-8);
  BrickRoom.prototype.broadcast.call(handler);
  const worlds = Array.from(packets.values()).map(p=>p.state);
  for(let i=1;i<worlds.length;i++)assert.deepEqual(worlds[0],worlds[i]);
  assert.equal(worlds[0].players.length,4);
  assert.equal(worlds[0].balls.length,1);
});


test("Solo HUD exposes multiplayer without a second homepage", () => {
  const solo = readFileSync(new URL("../src/index.mjs", import.meta.url), "utf8");
  const start = solo.indexOf("const GAME=") + "const GAME=".length;
  const end = solo.indexOf(";\nconst LEADERBOARD=", start);
  const game = JSON.parse(solo.slice(start,end));
  assert.match(game, /id="multi" href="\/multiplayer"/);
  assert.match(game, /aria-label="Play multiplayer"/);
  assert.equal((game.match(/href="\\/multiplayer"/g)||[]).length,1);
  assert.equal(solo.includes("new HTMLRewriter()"),false);
  assert.equal(solo.includes("4P</a>"),false);
  assert.equal((game.match(/id="wrap"/g)||[]).length,1);
});


test("shared invite links auto-join before considering an older remembered room", () => {
  const client = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  const start = client.lastIndexOf("const invite=new URL(location.href)");
  const end = client.lastIndexOf("})();");
  assert.ok(start >= 0 && end > start);
  const initialize = new Function("location", "localStorage", "autoJoin", "enter", "error", "URL", client.slice(start, end));
  const MockURL = class {
    constructor(href){
      const query=href.split("?")[1]||"";
      this.searchParams={get:key=>query.split("&").map(part=>part.split("=")).find(pair=>pair[0]===key)?.[1]??null};
    }
  };
  const activity = [];
  const location = {href: "https://example.com/multiplayer?room=ABCD23"};
  const storage = {getItem: () => "ZXY789"};
  initialize(location, storage, code => activity.push(["join",code]), code => activity.push(["resume",code]), error => activity.push(["error",error]), MockURL);
  assert.deepEqual(activity, [["join","ABCD23"]]);
  location.href = "https://example.com/multiplayer";
  activity.length = 0;
  initialize(location, storage, code => activity.push(["join",code]), code => {activity.push(["resume",code]);return {catch(){}};},error => activity.push(["error",error]), MockURL);
  assert.deepEqual(activity, [["resume","ZXY789"]]);
});

test("random invite names are valid and generated with secure randomness", () => {
  const client = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  const start = client.indexOf("function randomGuestName(){");
  const end = client.indexOf("function waiting(b)",start);
  assert.ok(start >= 0 && end > start);
  const factory = new Function("crypto",client.slice(start,end)+"return randomGuestName;");
  const guestName = factory({getRandomValues(arr){arr[0]=4;arr[1]=8;arr[2]=27;return arr;}});
  assert.match(guestName(),/^[A-Za-z0-9]{2,18}$/);
  assert.equal(guestName(),"LunarKoala37");
  assert.match(client,/await joinRoom\(code,\$\("playerName"\)\.value\)/);
});

test("brick changes redraw only changed cells rather than all tiles", () => {
  const client = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  const start = client.indexOf("let drawnPalette=null,drawnVaporPalette=null;");
  const end = client.indexOf("function draw(now){",start);
  assert.ok(start >= 0 && end > start);
  const tileOperations = {clear:0,fill:0};
  const tileCtx = {
    clearRect(){tileOperations.clear++;},
    fillRect(){tileOperations.fill++;},
    set fillStyle(v){}
  };
  const palette = Array(16).fill("#777");
  const renderer = new Function("tileCtx","PALETTE",
    "const GRID_COLS=58,GRID_ROWS=64,GRID_X=6,GRID_Y=40,GRID_SIZE=6;let style='clean',drawnHP=null,drawnStyle=null;"
    + client.slice(start,end) + "return paintTiles;")(tileCtx,{clean:palette,vintage:palette,vapor:palette});
  const board = {hp:"1".repeat(58*64),colors:"0".repeat(58*64),palette,vaporPalette:palette};
  renderer(board);
  assert.equal(tileOperations.clear,58*64);
  tileOperations.clear=0;tileOperations.fill=0;
  const change = {...board,hp:"0"+board.hp.slice(1)};
  renderer(change);
  assert.equal(tileOperations.clear,1);
  assert.equal(tileOperations.fill,0);
  renderer(change);
  assert.equal(tileOperations.clear,1);
});

test("multiplayer rendering uses bounded GPU resolution and persistent textures", () => {
  const client = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.match(client,/devicePixelRatio \|\| 1, 2/);
  assert.match(client,/gl\.texSubImage2D\(/);
  assert.match(client,/gl\.texImage2D\(gl\.TEXTURE_2D,0,gl\.RGBA,cv\.width,cv\.height/);
  assert.match(client,/const remaining=42-\(performance\.now\(\)-lastInputSent\)/);
  assert.match(source,/clamp\(\(now-this\.lastTick\)\/1000,0,\.25\)/);
});


test("connecting players update online counts immediately without waiting for the HUD throttle", () => {
  const client=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
  const from=client.indexOf("function accept(s){"),to=client.indexOf("function renderSeat(",from);
  assert.ok(from>=0&&to>from);
  const initial={code:"ABCDE2",round:0,status:"waiting",players:[{id:"p0",pos:.5,online:false}],hits:0};
  const incoming={...initial,players:[{id:"p0",pos:.5,online:true}]};
  let renders=0;
  const fn=new Function("performance","render","oldState","newState",
    "let state=oldState,you='p0',lastHP=null,lastHits=0,lastUiRender=100,lastEventSeq=-1,lastStateAt=0,drawnHP=null,localPos=.5;"
    +"function clearFx(){}function sparkle(){}function beep(){}function showPower(){}"
    +client.slice(from,to)+"accept(newState);");
  fn({now:()=>101},()=>{renders++},initial,incoming);
  assert.equal(renders,1);
});
