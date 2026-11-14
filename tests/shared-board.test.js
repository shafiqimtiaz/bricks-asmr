import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, bricks, aimVelocity, normalizeBallVelocity, drawBrickTile, browserCoreSource, soloCoreSource } from "../src/game-core.js";

import { loadServer, makeRoom, roomInstance, multiHtml as html, serverSource, soloHtml, soloWorker } from "./helpers.js";

const source = serverSource + html;
const server = loadServer();
const { assignedSides, assignSides, BrickRoom } = server;

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
 assert.match(soloWorker,/import \{ soloCoreSource \} from "\.\/game-core\.js"/);
 assert.match(soloHtml,/bricks\(seed,1,arena\)/);
 assert.match(soloHtml,/drawBrickTile\(bctx/);
 assert.match(html,/drawBrickTile\(tileCtx/);
 assert.match(soloWorker,/GAME\.replace\('<script>'/);
 assert.match(serverSource,/MULTIPLAYER_HTML\.replace\("<script>"/);
 assert.match(soloCoreSource,/function bricks\(/);
 assert.match(browserCoreSource,/function drawBrickTile\(/);
 for(const [seed,total] of [["ALPHA",3184],["TEST123",3476],["BRICKS",3226]]){
  const board=bricks(seed, 1);
  assert.equal(board.total,total);
  assert.equal(board.hp.length,58*64);
  assert.equal(board.total,[...board.hp].filter(c=>c!=="0").length);
  assert.ok(board.scale.length>=5);
 }
});

test("paddle rotations use Solo's exact angular response and ball speed",()=>{
 for(const off of [-1,-.5,0,.4,1]){
  const a=off*1.05,bottom=aimVelocity(0,a,330),top=aimVelocity(2,a,330),left=aimVelocity(1,a,330),right=aimVelocity(3,a,330);
  assert.ok(Math.abs(bottom.vx-330*Math.sin(a))<1e-9);
  assert.ok(Math.abs(bottom.vy+330*Math.cos(a))<1e-9);
  assert.ok(Math.abs(bottom.vx+top.vx)<1e-9&&Math.abs(bottom.vy+top.vy)<1e-9);
  assert.ok(Math.abs(left.vx+right.vx)<1e-9&&Math.abs(left.vy+right.vy)<1e-9);
  assert.ok(Math.abs(Math.hypot(bottom.vx,bottom.vy)-330)<1e-9);
 }
 const ball={vx:300,vy:10};
 normalizeBallVelocity(ball,330);
 assert.ok(Math.abs(Math.hypot(ball.vx,ball.vy)-330)<1e-9);
 assert.ok(Math.abs(ball.vy)>=330*.22);
});

test("a key tap nudges the paddle at once, not only while the key is held", () => {
  assert.match(html, /const KEY_NUDGE=0\.035;/);
  assert.match(html, /if\(!event\.repeat&&state\?\.status==="playing"&&\$\("hudMenu"\)\.hidden\)\{\s*const nudge=/);
  assert.match(html, /if\(nudge\)send\(localPos\+nudge\*KEY_NUDGE\);/);
});

test("the room advances one row per lost life, toward every occupied edge, and clients draw its transform",()=>{
 const room=makeRoom(server,"coop",4),S=room.sim,inst=roomInstance(server,room);
 S.balls=[{x:258,y:130,vx:0,vy:0,owner:"p0",source:"p0"}];
 for(let i=0;i<100;i++){
  Object.assign(S.balls[0],{x:258,y:130,vx:0,vy:0});
  inst.step(.1,Date.now());
 }
 assert.deepEqual(S.seats.map(seat=>S.crush.target[seat]),[0,0,0,0],"elapsed time alone cannot lower the court");
 assert.equal(inst.pending.filter(e=>e.t==="crush").length,0);
 S.balls=[{x:258,y:660,vx:0,vy:300,owner:"p0",source:"p0"}];
 inst.step(.05,Date.now());
 assert.deepEqual(S.seats.map(seat=>S.crush.target[seat]),[S.CS,S.CS,S.CS,S.CS]);
 assert.equal(inst.pending.filter(e=>e.t==="crush").length,1);
 for(let i=0;i<30;i++)inst.step(.05,Date.now());
 const snap=inst.snapshot();
 assert.ok(snap.crush[0]>1&&snap.crush[2]>1,"the formation stretches toward all four edges");
 assert.match(html,/ctx\.transform\(kx,0,0,ky,bx,by\)/);
 assert.doesNotMatch(html+serverSource,/crusherTransform|crushSteps|bounceBall/);
});

test("multiplayer uses Solo's grid size and a deterministic board", () => {
  const first = bricks("TEST123");
  assert.deepEqual(first, bricks("TEST123"));
  assert.equal(first.hp.length, 58 * 64);
  assert.equal(first.colors.length, first.hp.length);
  assert.equal(first.powerups.length, first.hp.length);
  assert.ok(first.palette.length === 16);
  assert.equal(first.total, [...first.hp].filter(digit => digit !== "0").length);
  assert.notEqual(first.hp, bricks("TEST124").hp);
});

test("multiplayer plays a whole Solo-style level on a field that leaves a lane before every paddle",()=>{
 const fields={2:[7,50,24,58],3:[11,46,26,56],4:[13,44,28,54]};
 const layouts=[2,3,4].map(n=>bricks("BRICKS", n));
 for(const [i,board] of layouts.entries()){
  const [c0,c1,r0,r1]=fields[i+2],cells=(c1-c0+1)*(r1-r0+1);
  assert.equal(board.hp.length,58*64);
  assert.equal(board.total,board.remaining);
  assert.equal(board.total,[...board.hp].filter(c=>c!=="0").length);
  for(let k=0;k<board.hp.length;k++)if(board.hp[k]!=="0"||board.powerups[k]!=="0"){
   const c=k%58,r=Math.floor(k/58);
   assert.ok(r>=r0&&r<=r1&&c>=c0&&c<=c1,"brick outside the "+(i+2)+"-player field");
  }
  // A real level, not a thinned-out crop: mostly filled, with walls, colour regions, power-ups and mirror symmetry.
  assert.ok(board.total>cells*.5,"dense "+(i+2)+"-player level: "+board.total+"/"+cells);
  assert.ok(board.hp.includes("3")&&board.powerups.includes("b"));
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)assert.equal(board.hp[r*58+c],board.hp[r*58+57-c]);
  assert.ok(Math.abs(board.centerX-180)<1&&Math.abs(board.centerY-292)<12);
 }
 assert.deepEqual(layouts[2],bricks("BRICKS", 4));
});

test("socket identity and sequence prevent controlling another paddle", async () => {
  const room = makeRoom(server, "versus", 2);
  const handler = roomInstance(server, room);handler.loop = {};
  const socket = { deserializeAttachment: () => ({ id: "p0" }), send() {}, close() {} };
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({
    type: "paddle-input", version: 1, seq: 2, pos: .7, playerId: "p1"
  }));
  assert.equal(room.players[0].pos, .7);
  assert.equal(room.players[1].pos, .5);
  assert.notEqual(room.sim.players[0].target, room.sim.players[1].target);
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({
    type: "paddle-input", version: 1, seq: 1, pos: .2
  }));
  assert.equal(room.players[0].pos, .7);
});

test("multiplayer renderer parses and Solo/leaderboard routes remain intact", () => {
  const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(js));
  const soloJs = soloHtml.slice(soloHtml.indexOf("<script>") + 8, soloHtml.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(soloJs));
  assert.match(js, /paintTiles\(s\?\.board\)/);
  assert.match(js, /E\.predict\(sim,you,260\)/);
  assert.match(js, /E\.puDef\(s\.set,pup\[2\],s\.mode\)/);
  assert.match(js, /seq:\+\+inputSeq/);
  assert.match(soloWorker, /path==='\/api\/leaderboard'/);
  assert.match(soloWorker, /import GAME from "\.\/solo\.html"/);
});

test("unknown WebSocket protocol versions and stale moves do not change paddles", async () => {
  const room = makeRoom(server, "coop", 2);
  const handler = roomInstance(server, room);handler.loop = {};
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
  assert.match(html, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(html, /send\(sliderPos\(view,boardPointer\(event\)\.x\)\)/);
});

test("Solo HUD exposes multiplayer without a second homepage", () => {
  const game = soloHtml;
  assert.match(game, /id="multi" href="\/multiplayer"/);
  assert.match(game, /aria-label="Play multiplayer"/);
  assert.equal((game.match(/href="\/multiplayer"/g)||[]).length,1);
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
  const end = client.indexOf("// The court backdrop", start);
  assert.ok(start >= 0 && end > start);
  const ops = { clear: 0, fill: 0, full: 0 };
  const tileCtx = {
    setTransform() {},
    clearRect(x, y, w, h) { ops.clear++; if (w === 360 && h === 640) ops.full++; },
    fillRect() { ops.fill++; },
    set fillStyle(v) {}
  };
  const palette = Array(16).fill("#777");
  const cache = new Function("tileCtx", "PALETTE", "drawBrickTile",
    "const GRID_COLS=58,GRID_ROWS=64,GRID_X=6,GRID_Y=40,GRID_SIZE=6,W=360,H=640,tileScale=2;let style='clean',hpArr=Uint8Array.from({length:58*64},()=>1),colArr=new Uint8Array(58*64),dirty=[],tilesFull=true,drawnStyle=null;"
    + client.slice(start, end) + "return {paintTiles,change:(i,h)=>{hpArr[i]=h;dirty.push(i);},newRound:()=>{tilesFull=true;},setStyle:v=>{style=v;}};")(tileCtx, { clean: palette, vintage: palette, vapor: palette }, drawBrickTile);
  const board = { palette, vaporPalette: palette };
  cache.paintTiles(board);
  assert.equal(ops.clear, 58 * 64 + 1, "the first paint clears the canvas and every cell");
  ops.clear = ops.fill = ops.full = 0;
  cache.paintTiles(board);
  assert.equal(ops.clear, 0, "nothing changed, nothing repainted");
  cache.change(0, 0);
  cache.paintTiles(board);
  assert.equal(ops.clear, 1, "one broken brick repaints one cell");
  assert.equal(ops.fill, 0);
  cache.paintTiles(board);
  assert.equal(ops.clear, 1);
  cache.newRound();
  cache.paintTiles(board);
  assert.equal(ops.full, 1, "a new round repaints everything");
  cache.setStyle("vintage");
  cache.paintTiles(board);
  assert.equal(ops.full, 2, "so does a new theme");
});

test("multiplayer rendering uses bounded GPU resolution and persistent textures", () => {
  const client = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.match(client,/devicePixelRatio \|\| 1, 2/);
  assert.match(client,/gl\.texSubImage2D\(/);
  assert.match(client,/gl\.texImage2D\(gl\.TEXTURE_2D,0,gl\.RGBA,width,height/);
  assert.match(client,/const remaining=42-\(performance\.now\(\)-lastInputSent\)/);
  assert.match(serverSource,/clamp\(\(now-this\.lastTick\)\/1000,0,\.25\)/);
});

test("connecting players update online counts immediately without waiting for the HUD throttle", () => {
  const client=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
  const from=client.indexOf("function accept(s){"),to=client.indexOf("function renderSeat(",from);
  assert.ok(from>=0&&to>from);
  const initial={code:"ABCDE2",round:0,status:"waiting",players:[{id:"p0",online:false}],crush:[1,0,1,0],balls:[]};
  const incoming={...initial,players:[{id:"p0",online:true}]};
  let renders=0;
  const fn=new Function("performance","render","oldState","newState",
    "let state=oldState,you='p0',lastUiRender=100,lastStateAt=0,tilesFull=false,localPos=.5,popAt=null,W=360,clock=0,board=null,hpArr=null,colArr=null,dirty=[],sim=null,floats=[],style='clean',heldBefore=false;"
    +"function clearFx(){}function react(){}function buildSim(){}function holdingServe(){return false;}function queueInput(){}function adoptArena(){}function resize(){}"
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
 const solo=soloWorker;
 assert.ok(solo.includes("||/^\\/multiplayer\\/[A-Z2-9]{6}\\/?$/i.test(path)"));
 assert.ok(source.includes("(join|rename|state|socket|action|leave)"));
 assert.match(html,/location\.origin\+"\/multiplayer\/"\+roomCode/);
});

test("Solo opens straight into the game; multiplayer lobby keeps shared branding",()=>{
 const game=soloHtml;
 // No home screen on Solo: / loads the board directly, no PLAY SOLO click.
 assert.doesNotMatch(game,/id="homeLobby"/);
 assert.doesNotMatch(game,/id="playSolo"/);
 assert.doesNotMatch(game,/id="home"/);
 assert.match(game,/<title>Bricks ASMR · Single Player<\/title>/);
 // No mid-board instruction notice, at start or after losing a ball:
 // aiming must never be covered by 'slide below / drag board / tap to launch'.
 assert.doesNotMatch(game,/AIM_MSG/);
 assert.doesNotMatch(game,/slide below to move/);
 assert.doesNotMatch(game,/drag board to fine-aim/);
 assert.doesNotMatch(game,/tap to launch/);
 assert.match(game,/id="hudMenuToggle"/);
 assert.match(game,/id="hudMenu" hidden/);
 assert.match(game,/id="multi" href="\/multiplayer"/);
 assert.match(game,/#hudMenu\[hidden\]\{display:none!important\}/);
 // The multiplayer lobby keeps the shared branding.
 assert.match(html,/BRICKS ASMR<\/h1>/);
 assert.match(html,/<em>by Shafiq 😉<\/em>/);
 assert.match(html,/>LOBBY<\/h2>/);
 assert.match(html,/id="hudMenuToggle"/);
 assert.match(html,/id="hudMenu" hidden/);
 assert.match(html,/id="create"/);
 assert.match(html,/id="join"/);
 assert.match(html,/id="playerName"/);
 assert.doesNotMatch(html,/>SHARED BOARD</);
 assert.equal((game.match(/id="wrap"/g)||[]).length,1);
 assert.equal((html.match(/id="wrap"/g)||[]).length,1);
});

test("multiplayer lobby maps the current player to the bottom slot",()=>{
 const js=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
 const from=js.indexOf("function render(){"),to=js.indexOf("let GRID_X=",from);
 assert.ok(from>=0&&to>from);
 const players=[{id:"p0",name:"Host",seat:0,online:true,lives:3},{id:"p1",name:"Guest",seat:2,online:true,lives:3}];
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",hidden:false,style:{},classList:{toggle(){}}});return nodes.get(id);};
 const calls=[],state={code:"ABCD23",players,hostId:"p0",status:"waiting",round:0,elapsed:0,balls:[],remaining:0,board:{total:1}};
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

test("a board is identified by its seed: leaderboard keys carry no level and old keys are rejected", () => {
 const KEY = new Function("return " + /const KEY=(\/.*?\/),ID=/.exec(soloWorker)[1])();
 for (const ok of ["abc123-clean", "d20261112-vapor-a480", "zz9q-vintage"]) assert.ok(KEY.test(ok), ok);
 for (const bad of ["abc123-1-clean", "abc123-12-vintage-a480", "abc123", "abc123-crt"]) assert.ok(!KEY.test(bad), bad);
 assert.doesNotMatch(soloHtml, /level\+\+|&level=|\blevel\b\s*=/);
 assert.match(soloHtml, /const boardId=\(\)=>seed\+'-'\+style/);
});
