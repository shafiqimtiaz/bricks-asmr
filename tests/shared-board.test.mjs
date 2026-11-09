import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bricks, bounceBall, normalizeBallVelocity, drawBrickTile, browserCoreSource, soloCoreSource } from "../src/game-core.mjs";

const source = readFileSync(new URL("../src/multi.mjs", import.meta.url), "utf8");
const server = source.slice(0, source.indexOf("const MULTIPLAYER_HTML="))
  .replace(/^import .*?;\s*/gm, "")
  .replace("export class BrickRoom", "class BrickRoom");
const { assignedSides, assignSides, startRound, advanceBall, grantPower, replenishBalls, BrickRoom } =
  new Function("DurableObject","bricks","bounceBall", server + ";return {assignedSides,assignSides,startRound,advanceBall,grantPower,replenishBalls,BrickRoom};")(class {},bricks,bounceBall);
const htmlStart = source.indexOf("const MULTIPLAYER_HTML=") + "const MULTIPLAYER_HTML=".length;
const htmlEnd = source.indexOf(";\nexport default", htmlStart);
const html = JSON.parse(source.slice(htmlStart, htmlEnd));

test("there is one board and each occupied player gets a unique side", () => {
  const expected = { 1: [0], 2: [0, 2], 3: [0, 2, 1], 4: [0, 2, 1, 3] };
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


test("Solo and Multiplayer share generator, bounce mechanics and tile renderer",()=>{
 const solo=readFileSync(new URL("../src/index.mjs",import.meta.url),"utf8");
 assert.match(solo,/import \{ soloCoreSource \} from "\.\/game-core\.mjs"/);
 assert.match(source,/import \{ bricks, bounceBall, browserCoreSource \} from "\.\/game-core\.mjs"/);
 assert.match(solo,/bricks\(seed,level,1\)/);
 assert.match(solo,/drawBrickTile\(bctx/);
 assert.match(source,/bounceBall\(ball,side,deflect,330\)/);
 assert.match(source,/drawBrickTile\(tileCtx/);
 assert.match(solo,/GAME\.replace\('<script>'/);
 assert.match(source,/MULTIPLAYER_HTML\.replace\("<script>"/);
 assert.match(soloCoreSource,/function bricks\(/);
 assert.match(browserCoreSource,/function drawBrickTile\(/);
 for(const [seed,total] of [["ALPHA",3184],["TEST123",3476],["BRICKS",3226]]){
  const board=bricks(seed,1,1);
  assert.equal(board.total,total);
  assert.equal(board.hp.length,58*64);
  assert.equal(board.total,[...board.hp].filter(c=>c!=="0").length);
  assert.ok(board.scale.length>=5);
 }
});

test("paddle rotations use Solo's exact angular response and ball speed",()=>{
 for(const off of [-1,-.5,0,.4,1]){
  const bottom=bounceBall({vx:0,vy:0},0,off,330);
  const top=bounceBall({vx:0,vy:0},2,off,330);
  const left=bounceBall({vx:0,vy:0},1,off,330);
  const right=bounceBall({vx:0,vy:0},3,off,330);
  assert.ok(Math.abs(bottom.vx-330*Math.sin(off*1.05))<1e-9);
  assert.ok(Math.abs(bottom.vy+330*Math.cos(off*1.05))<1e-9);
  assert.ok(Math.abs(bottom.vx+top.vx)<1e-9&&Math.abs(bottom.vy+top.vy)<1e-9);
  assert.ok(Math.abs(left.vx+right.vx)<1e-9&&Math.abs(left.vy+right.vy)<1e-9);
  assert.ok(Math.abs(Math.hypot(bottom.vx,bottom.vy)-330)<1e-9);
 }
 const ball={vx:300,vy:10};
 normalizeBallVelocity(ball,330);
 assert.ok(Math.abs(Math.hypot(ball.vx,ball.vy)-330)<1e-9);
 assert.ok(Math.abs(ball.vy)>=330*.22);
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

test("more players compress the shared bricks and leave clear paddle approach lanes",()=>{
 const layouts=[2,3,4].map(n=>bricks("BRICKS",1,n));
 for(const [i,board] of layouts.entries()){
  assert.equal(board.hp.length,58*64);
  assert.equal(board.total,board.remaining);
  assert.ok(board.total>60&&board.total<500,"sparse bricks for "+(i+2)+" players");
  for(let k=0;k<board.hp.length;k++)if(board.hp[k]!=="0"){
   const c=k%58,r=Math.floor(k/58);
   assert.ok(r>=24&&r<=58&&c>=7&&c<=50);
   assert.ok(c%4<2&&r%4<2);
  }
 }
 assert.ok(layouts[0].total>layouts[1].total&&layouts[1].total>layouts[2].total);
 assert.deepEqual(layouts[2],bricks("BRICKS",1,4));
});

function roomForPlayers(count = 4) {
  const players = Array.from({ length: count }, (_, i) =>
    ({ id: "p" + i, seat: -1, pos: .5, lives: 3, score: 0, online: true, lastSeq: -1, lastInputAt: 0 }));
  assignSides(players);
  const room = { code: "BRICKS", players, status: "waiting", round: 0 };
  startRound(room);
  return room;
}

test("two to four players each launch an inward ball from their own edge",()=>{
 for(const count of [2,3,4]){
  const room=roomForPlayers(count);
  assert.equal(room.balls.length,count);
  assert.deepEqual(new Set(room.balls.map(b=>b.source)),new Set(room.players.map(p=>p.id)));
  for(const b of room.balls){
   const seat=room.players.find(p=>p.id===b.source).seat;
   assert.equal(b.owner,b.source);
   assert.ok(seat===0?b.vy<0:seat===2?b.vy>0:seat===1?b.vx>0:b.vx<0);
  }
 }
});

test("opponent deflections do not change which player a ball belongs to",()=>{
 const room=roomForPlayers(2);
 const ball=room.balls.find(b=>b.source==="p1");
 Object.assign(ball,{x:180,y:531,vx:0,vy:330});
 advanceBall(room,ball,.01);
 assert.equal(ball.source,"p1");
 assert.equal(ball.owner,"p0");
 assert.ok(ball.vy<0);
});

test("reconnecting players regain their ball without duplicating others",()=>{
 const room=roomForPlayers(3);
 room.balls=room.balls.filter(b=>b.source!=="p1");
 replenishBalls(room);
 assert.equal(room.balls.length,3);
 assert.equal(room.balls.filter(b=>b.source==="p1").length,1);
 replenishBalls(room);
 assert.equal(room.balls.length,3);
 assert.match(source,/if\(r\.status==="playing"\)replenishBalls\(r\)/);
});

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
  assert.match(js, /b\.source===you/);
  assert.match(js, /seq:\+\+inputSeq/);
  const solo = readFileSync(new URL("../src/index.mjs", import.meta.url), "utf8");
  assert.match(solo, /path==='\/api\/leaderboard'/);
  assert.match(solo, /const GAME=/);
});


test("a missed ball costs one life without deleting a surviving multiball", () => {
  const room = roomForPlayers(2);
  const top = room.players.find(p => p.seat === 2);
  const miss = { x: 30, y: 39, vx: 0, vy: -330, owner: "p1", source:"p1" };
  const surviving = { x: 180, y: 480, vx: 130, vy: -260, owner: "p0", source:"p0" };
  room.balls = [miss, surviving];
  advanceBall(room, miss, .01);
  assert.equal(top.lives, 2);
  assert.equal(room.balls.length, 2);
  assert.ok(room.balls.includes(surviving));
  assert.equal(room.balls.filter(b=>b.source==="p1").length,1);
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
  assert.equal(worlds[0].balls.length,4);
  assert.deepEqual(new Set(worlds[0].balls.map(b=>b.source)),new Set(room.players.map(p=>p.id)));
});


test("Solo HUD exposes multiplayer without a second homepage", () => {
  const solo = readFileSync(new URL("../src/index.mjs", import.meta.url), "utf8");
  const start = solo.indexOf("const GAME=") + "const GAME=".length;
  const end = solo.indexOf(";\nconst LEADERBOARD=", start);
  const game = JSON.parse(solo.slice(start,end));
  assert.match(game, /id="multi" href="\/multiplayer"/);
  assert.match(game, /aria-label="Play multiplayer"/);
  assert.equal((game.match(/href="\/multiplayer"/g)||[]).length,2);
  assert.equal(solo.includes("new HTMLRewriter()"),false);
  assert.equal(solo.includes("4P</a>"),false);
  assert.equal((game.match(/id="wrap"/g)||[]).length,1);
});


test("room-specific invitations take priority, legacy query invites do not join", () => {
 const client=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const start=client.lastIndexOf("const invitedPath=location.pathname"),end=client.lastIndexOf("})();");
 assert.ok(start>=0&&end>start);
 const initialize=new Function("location","localStorage","loadInvite","enter",client.slice(start,end));
 const events=[],storage={getItem:()=>null};
 const location={pathname:"/multiplayer/ABCD23"};
 const resume=code=>{events.push(["resume",code]);return {catch(){}};};
 initialize(location,storage,code=>events.push(["invite",code]),resume);
 assert.deepEqual(events,[["invite","ABCD23"]]);
 location.pathname="/multiplayer";events.length=0;
 initialize(location,storage,code=>events.push(["invite",code]),resume);
 assert.deepEqual(events,[]);
 const saved={getItem:()=> "ZYX987"};
 initialize(location,saved,code=>events.push(["invite",code]),resume);
 assert.deepEqual(events,[["resume","ZYX987"]]);
 assert.doesNotMatch(client,/searchParams\.get\(["']room["']\)|randomGuestName\(|autoJoin\(/);
 assert.match(html,/id="acceptInvite"/);
});

test("invited player must enter a real gamer name before joining", async () => {
 const client=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const nameStart=client.indexOf("function name(){"),nameEnd=client.indexOf("function waiting(",nameStart);
 const $=()=>({value:""});
 const readName=new Function("$",client.slice(nameStart,nameEnd)+"return name;");
 assert.throws(()=>readName($)(),/gamer name/);
 assert.throws(()=>readName(()=>({value:"!"}))(),/gamer name/);
 assert.equal(readName(()=>({value:"  Brick Master  "}))(),"Brick Master");
 const from=client.indexOf("function showInvitePrompt("),to=client.indexOf("function openNicknamePrompt(",from);
 const ui={joinCode:{},inviteCode:{},playerName:{value:"StoredName",focus(){}},roomActions:{},inviteDetails:{},panel:{},intro:{},room:{}};
 const build=new Function("$","enter","error",client.slice(from,to)+"return {showInvitePrompt,loadInvite};");
 const events=[],gate=build(id=>ui[id],async code=>{events.push(["check",code]);throw Object.assign(new Error("Join the lobby first"),{status:401});},message=>events.push(["error",message]));
 await gate.loadInvite("ABCD23");
 assert.deepEqual(events,[["check","ABCD23"]]);
 assert.equal(ui.playerName.value,"");
 assert.equal(ui.inviteDetails.hidden,false);
 assert.equal(ui.roomActions.hidden,true);
 assert.equal(ui.joinCode.value,"ABCD23");
 const returning=build(id=>ui[id],async code=>events.push(["resumed",code]),message=>events.push(["error",message]));
 ui.inviteDetails.hidden=true;events.length=0;
 await returning.loadInvite("ABCD23");
 assert.deepEqual(events,[["resumed","ABCD23"]]);
 assert.equal(ui.inviteDetails.hidden,true);
 assert.match(client,/await joinRoom\(code,displayName\)/);
 assert.match(client,/const displayName=name\(\)/);
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
  const renderer = new Function("tileCtx","PALETTE","drawBrickTile",
    "const GRID_COLS=58,GRID_ROWS=64,GRID_X=6,GRID_Y=40,GRID_SIZE=6;let style='clean',drawnHP=null,drawnStyle=null;"
    + client.slice(start,end) + "return paintTiles;")(tileCtx,{clean:palette,vintage:palette,vapor:palette},drawBrickTile);
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

test("invited players resume an authenticated seat and can rename without duplicating it",async()=>{
 const code="ABCD23",player={id:"player-one",token:"session-secret",name:"PixelFox23",seat:0,pos:.5,score:0,lives:3};
 const room={code,players:[player],status:"waiting",lastActivity:Date.now(),round:0};
 let broadcasts=0,saves=0;
 const handler={room,save:async()=>{saves++;},broadcast:()=>{broadcasts++;}};
 const call=(action,body,cookie="brick_room_"+code+"=session-secret")=>BrickRoom.prototype.fetch.call(handler,new Request("https://game.example/api/rooms/"+code+"/"+action,{
  method:"POST",headers:{"cookie":cookie,"content-type":"application/json"},body:JSON.stringify(body)
 }));
 const resumed=await call("join",{name:"AnotherPlayer"});
 assert.equal(resumed.status,200);
 assert.equal((await resumed.json()).resumed,true);
 assert.equal(room.players.length,1);
 const renamed=await call("rename",{name:"New Gamer"});
 assert.equal(renamed.status,200);
 assert.equal((await renamed.json()).name,"New Gamer");
 assert.equal(player.name,"New Gamer");
 assert.equal(saves,1);assert.equal(broadcasts,1);
 assert.equal((await call("rename",{name:"!"})).status,400);
 assert.equal((await call("rename",{name:"Intruder"},"")).status,401);
 assert.equal(player.name,"New Gamer");
});

test("new invite joins reserve exactly one seat and set a session cookie",async()=>{
 const code="ABCD23",host={id:"host",token:"host-token",name:"Host",seat:0,pos:.5,score:0,lives:3};
 const room={code,players:[host],status:"waiting",lastActivity:Date.now(),round:0};
 const handler={room,save:async()=>{},broadcast:()=>{}};
 const response=await BrickRoom.prototype.fetch.call(handler,new Request("https://game.example/api/rooms/"+code+"/join",{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"GuestGamer"})
 }));
 assert.equal(response.status,201);
 assert.equal((await response.json()).resumed,false);
 assert.equal(room.players.length,2);
 assert.match(response.headers.get("set-cookie"),/HttpOnly/);
});

test("multiplayer copied invites use path URLs and accept rename routes",()=>{
 const solo=readFileSync(new URL("../src/index.mjs",import.meta.url),"utf8");
 assert.ok(solo.includes("||/^\\/multiplayer\\/[A-Z2-9]{6}\\/?$/i.test(path)"));
 assert.ok(source.includes("(join|rename|state|socket|action|leave)"));
 assert.match(html,/location\.origin\+"\/multiplayer\/"\+roomCode/);
});

test("each multiplayer player has a bottom-edge camera and consistent left-right controls",()=>{
 const js=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const from=js.indexOf("const BOARD_W=348,BOARD_H=504;"),to=js.indexOf("const tiles=",from);
 assert.ok(from>=0&&to>from);
 const getCamera=new Function("SX0","SX1",js.slice(from,to)+"return {viewPoint,applyBoardView,paddleInputPos,localPaddlePos};");
 const {viewPoint,applyBoardView,paddleInputPos,localPaddlePos}=getCamera(40,320);
 const paddles=[{seat:0,x:180,y:535},{seat:1,x:12,y:292},{seat:2,x:180,y:36},{seat:3,x:348,y:292}];
 for(const {seat,x,y} of paddles){
  const pos=viewPoint(seat,x,y);
  assert.ok(Math.abs(pos.x-180)<1,"seat "+seat+" centers its own paddle");
  assert.ok(pos.y>=529&&pos.y<=553,"seat "+seat+" shows own paddle at bottom: "+pos.y);
  assert.ok(Math.abs(viewPoint(seat,180,292).x-180)<1e-9);
  assert.ok(Math.abs(viewPoint(seat,180,292).y-292)<1e-9);
  assert.equal(localPaddlePos(seat,paddleInputPos(seat,40)),0);
  assert.equal(localPaddlePos(seat,paddleInputPos(seat,320)),1);
  assert.equal(paddleInputPos(seat,40)>=0&&paddleInputPos(seat,40)<=1,true);
  const transforms=[];
  applyBoardView({transform(...args){transforms.push(args);}},seat);
  assert.equal(transforms.length,seat===0?0:1);
 }
 assert.match(js,/const relativeSide=\(p\.seat-cameraSeat\+4\)%4/);
 assert.match(js,/send\(paddleInputPos\(side,x\)\)/);
 assert.match(js,/side===2\|\|side===3\?-1:1/);
 assert.match(js,/ctx\.save\(\);applyBoardView\(ctx,cameraSeat\)/);
});

test("side paddle collision reach is proportional to a top or bottom paddle",()=>{
 const s=source;
 assert.match(s,/half=\(\(r\.effects\?\.wideUntil\|\|0\)>Date\.now\(\)\?49:36\)\*\(horizontal\?1:504\/348\)/);
 const room=roomForPlayers(4),p=room.players.find(player=>player.seat===1);
 p.pos=.5;const edge={x:15,y:292+48,vx:-330,vy:0,owner:null};
 room.balls=[edge];advanceBall(room,edge,.01);
 assert.equal(p.score,2);
 assert.equal(p.lives,3);
});

test("Solo and multiplayer lobby have shared branding and uncluttered menus",()=>{
 const solo=readFileSync(new URL("../src/index.mjs",import.meta.url),"utf8");
 const start=solo.indexOf("const GAME=")+"const GAME=".length,end=solo.indexOf(";\nconst LEADERBOARD=",start);
 const game=JSON.parse(solo.slice(start,end));
 for(const page of [game,html]){
  assert.match(page,/BRICKS ASMR<\/h1>/);
  assert.match(page,/<em>by Shafiq 😉<\/em>/);
  assert.match(page,/>LOBBY<\/h2>/);
  assert.match(page,/id="hudMenuToggle"/);
  assert.match(page,/id="hudMenu" hidden/);
 }
 assert.match(game,/id="playSolo"/);
 assert.match(game,/id="multi" href="\/multiplayer"/);
 assert.match(html,/id="create"/);
 assert.match(html,/id="join"/);
 assert.match(html,/id="playerName"/);
 assert.doesNotMatch(html,/>SHARED BOARD</);
 assert.equal((game.match(/id="wrap"/g)||[]).length,1);
 assert.equal((html.match(/id="wrap"/g)||[]).length,1);
 assert.match(game,/#homeLobby\[hidden\],#hudMenu\[hidden\]\{display:none!important\}/);
});

test("multiplayer lobby maps the current player to the bottom slot",()=>{
 const js=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const from=js.indexOf("function render(){"),to=js.indexOf("const GRID_X=",from);
 assert.ok(from>=0&&to>from);
 const players=[{id:"p0",name:"Host",seat:0,online:true,lives:3},{id:"p1",name:"Guest",seat:2,online:true,lives:3}];
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",hidden:false});return nodes.get(id);};
 const calls=[],state={code:"ABCD23",players,hostId:"p0",status:"waiting",round:0,remaining:90,balls:[],board:{hp:"0",remaining:0,total:1}};
 const fn=new Function("$","state","you","renderSeat",js.slice(from,to)+"return render;");
 const render=fn($,state,"p1",(side,p,mine)=>calls.push({side,id:p?.id,mine}));
 render();
 assert.equal(calls.length,4);
 assert.deepEqual(calls[0],{side:0,id:"p1",mine:true});
 assert.deepEqual(calls[2],{side:2,id:"p0",mine:false});
});

test("joining and leaving never reassigns existing players or resets their controls", () => {
 const players=[{id:"host",seat:-1,pos:.5}];
 assignSides(players);
 players[0].pos=.18;
 assert.deepEqual(players.map(p=>p.seat),[0]);
 const second={id:"second",seat:0,pos:.5};
 players.push(second);assignSides(players);
 assert.equal(second.seat,2);
 second.pos=.29;
 const third={id:"third",seat:0,pos:.5};
 players.push(third);assignSides(players);
 assert.deepEqual(players.map(p=>p.seat),[0,2,1]);
 assert.equal(players[0].pos,.18);
 assert.equal(second.pos,.29);
 third.pos=.71;
 const fourth={id:"fourth",seat:0,pos:.5};
 players.push(fourth);assignSides(players);
 assert.deepEqual(players.map(p=>p.seat),[0,2,1,3]);
 assert.equal(third.pos,.71);
 players.splice(players.indexOf(second),1);
 assignSides(players);
 assert.deepEqual(players.map(p=>p.seat),[0,1,3]);
 const newGuest={id:"replacement",seat:0,pos:.5};
 players.push(newGuest);assignSides(players);
 assert.deepEqual(players.map(p=>p.seat),[0,1,3,2]);
 assert.equal(third.pos,.71);
 assert.equal(players[0].pos,.18);
});

test("a third room join keeps the second player's camera seat unchanged", async () => {
 const code="ABCD23",host={id:"host",token:"host-token",name:"Host",seat:0,pos:.2,score:0,lives:3};
 const room={code,players:[host],status:"waiting",lastActivity:Date.now(),round:0};
 const handler={room,save:async()=>{},broadcast:()=>{}};
 const join=async name=>{
  const response=await BrickRoom.prototype.fetch.call(handler,new Request("https://game.example/api/rooms/"+code+"/join",{
   method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})
  }));
  assert.equal(response.status,201);
  return room.players.at(-1);
 };
 const guest=await join("GuestTwo");
 assert.equal(guest.seat,2);
 guest.pos=.37;
 await join("GuestThree");
 assert.equal(guest.seat,2);
 assert.equal(guest.pos,.37);
 assert.equal(host.pos,.2);
 assert.deepEqual(room.players.map(p=>p.seat),[0,2,1]);
});

test("an old tab does not repeatedly reconnect after another tab takes the same seat", () => {
 const client=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const from=client.indexOf("function connect(){"),to=client.indexOf("let lastUiRender=",from);
 assert.ok(from>=0&&to>from);
 const sockets=[],nodes={connection:{},panel:{hidden:true},room:{hidden:true},statusText:{},roomTitle:{},glass:{hidden:true},glassTitle:{},glassText:{},start:{hidden:false}};
 let scheduled=0;
 const WebSocket=class{constructor(url){this.url=url;sockets.push(this);}};
 const setup=new Function("WebSocket","location","$","clearTimeout","setTimeout",
  'const API="/api/multiplayer/rooms";let closed=false,roomCode="ABCD23",socket=null,retry=null,inputSeq=0,lastInputSent=0,pendingInput=null;'
  +client.slice(from,to)+'return {connect,getRetry:()=>retry};');
 const conn=setup(WebSocket,{protocol:"https:",host:"game.example"},id=>nodes[id],()=>{},()=>{scheduled++;return scheduled;});
 conn.connect();
 assert.equal(sockets.length,1);
 sockets[0].onclose({code:1000,reason:"Reconnected"});
 assert.equal(conn.getRetry(),null);
 assert.equal(scheduled,0);
 assert.equal(nodes.connection.textContent,"Opened elsewhere");
 assert.equal(nodes.panel.hidden,false);
 assert.equal(nodes.start.hidden,true);
 assert.match(nodes.glassText.textContent,/other tab/);
 const again=setup(WebSocket,{protocol:"https:",host:"game.example"},id=>nodes[id],()=>{},()=>{scheduled++;return scheduled;});
 again.connect();const socket=sockets.at(-1);
 socket.onclose({code:1006,reason:""});
 assert.equal(scheduled,1);
});

test("lobby pointer movement cannot move a paddle before a round starts", () => {
 const client=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const from=client.indexOf("function send(pos){"),to=client.indexOf("function pointer(",from);
 assert.ok(from>=0&&to>from);
 const setup=new Function("socket","state","WebSocket","clearTimeout","setTimeout","performance","flushInput",
  'let localPos=.5,lastInputSent=0,pendingInput=null;'+client.slice(from,to)+'return {send,getPos:()=>localPos};');
 const controller=setup({readyState:1},{status:"waiting"},{OPEN:1},()=>{},()=>{}, {now:()=>100},()=>{});
 controller.send(.08);
 assert.equal(controller.getPos(),.5);
});

test("rapid repeated join or create clicks cannot reserve duplicate players", async () => {
 const client=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const from=client.indexOf("let joining=false;"),to=client.indexOf("function showInvitePrompt(",from);
 assert.ok(from>=0&&to>from);
 let release;
 let calls=0;
 const elements={create:{},join:{},acceptInvite:{},joinCode:{value:"ABCDE2"}};
 const storage={setItem(){}};
 const createFlow=new Function("$","request","enter","localStorage","error","name",
  client.slice(from,to)+"return {doCreate,doJoin,isJoining:()=>joining};");
 const flow=createFlow(id=>elements[id],async (path,body)=>{
  calls++;
  await new Promise(resolve=>{release=resolve;});
  return {code:"ABCDE2",you:"new-player",resumed:false};
 },async()=>{},storage,()=>{},()=>"PlayerOne");
 const first=flow.doJoin();
 assert.equal(flow.isJoining(),true);
 await flow.doJoin();
 await flow.doCreate();
 assert.equal(calls,1);
 release();await first;
 assert.equal(flow.isJoining(),false);
 const second=flow.doCreate();
 assert.equal(calls,2);
 release();await second;
 assert.equal(flow.isJoining(),false);
});

test("host explicitly leaving a live round hands control to an online player without moving seats", async () => {
 const room=roomForPlayers(3);
 room.hostId="p0";room.lastActivity=Date.now();
 for(let i=0;i<room.players.length;i++)room.players[i].token="token-"+i;
 let saves=0,broadcasts=0;
 const handler={room,liveIds:()=>new Set(["p0","p2"]),
  save:async()=>{saves++;},broadcast:()=>{broadcasts++;}};
 const request=new Request("https://qa.test/api/rooms/BRICKS/leave",{
  method:"POST",headers:{cookie:"brick_room_BRICKS=token-0"}
 });
 const response=await BrickRoom.prototype.fetch.call(handler,request);
 assert.equal(response.status,200);
 assert.equal(room.hostId,"p2");
 assert.deepEqual(room.players.map(p=>p.seat),[0,2,1]);
 assert.equal(room.players.length,3);
 assert.equal(saves,1);
 assert.equal(broadcasts,1);
});
