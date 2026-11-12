import { DurableObject } from "cloudflare:workers";
import { arenaLayout, bricks, browserCoreSource } from "./game-core.mjs";
import { brickEngine, engineSource } from "./engine.mjs";
import MULTIPLAYER_HTML from "./multiplayer.html";
const ABC="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",TTL=21600000;
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
function reply(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...extra}});}
function nameOf(v){if(typeof v!=="string")return "";const s=v.trim().normalize("NFKC");return /^[\p{L}\p{N} ._-]{2,18}$/u.test(s)?s:"";}
function cookieFor(code,t){return "brick_room_"+code+"="+t+"; Path=/; Max-Age=21600; HttpOnly; Secure; SameSite=Lax";}
function authToken(req,code){const raw=req.headers.get("cookie")||"",key="brick_room_"+code+"=";const v=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(key));return v?v.slice(key.length):"";}
function newToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");}

const MAX_BALLS=40,SEAT_ORDER=[0,2,1,3];
function assignedSides(n){return SEAT_ORDER.slice(0,n);}
function assignSides(players){
 const used=new Set();
 for(const p of players){
  if(!SEAT_ORDER.includes(p.seat)||used.has(p.seat)){
   p.seat=SEAT_ORDER.find(side=>!used.has(side));
   p.pos=.5;
  }
  used.add(p.seat);
 }
}

// The room runs the same engine as Solo: one authoritative state (room.sim) for the whole round.
const E=brickEngine(Math.random);
const MODES=["coop","versus"],SETS=["clean","vintage","vapor"],HOLD_SECONDS=5,COUNTDOWN=3,OFFLINE_GRACE=30000,MAX_AIM=1.15;
const num=(v,k=10)=>Math.round(v*k)/k;
const simPlayer=(r,id)=>r.sim?.players.find(p=>p.id===id)||null;
// Whether a player can no longer take part: explicitly out, or (Versus) without lives, or (Coop) the pool is empty.
const outOf=(S,p)=>p.out||(S.mode==="versus"?p.lives<=0:S.pool<=0);
function randomSeed(){return Math.random().toString(36).slice(2,8);}
function startRound(r,set="vintage"){
 r.status="playing";r.round=(r.round||0)+1;r.seed=randomSeed();
 r.mode=MODES.includes(r.mode)?r.mode:"versus";r.set=SETS.includes(set)?set:"vintage";
 r.startedAt=Date.now()+COUNTDOWN*1000;r.finishedAt=0;r.result=null;
 r.arena=r.arena||arenaLayout();
 r.board=bricks(r.seed,r.players.length,r.arena);
 for(const p of r.players){p.pos=.5;p.lastSeq=-1;p.lastInputAt=0;p.offlineAt=p.online===false?Date.now():0;}
 // Coop shares one pool of lives (3 per player); Versus gives everyone 4.
 const coop=r.mode==="coop",lives=coop?3*r.players.length:4,host=r.players.find(p=>p.id===r.hostId&&p.online!==false)||r.players.find(p=>p.online!==false);
 const S=r.sim=E.create({arena:r.arena,board:r.board,players:r.players.map(p=>({id:p.id,seat:p.seat,online:p.online!==false})),mode:r.mode,set:r.set,
  lives,maxLives:coop?lives+3:6,holdSeconds:HOLD_SECONDS,maxBalls:MAX_BALLS,server:host?.id});
 // Nobody serves for a player who is not connected; the engine hands them a ball when they return.
 S.balls=S.balls.filter(b=>r.players.find(p=>p.id===b.source)?.online!==false);
 // The first serves wait out the countdown as well.
 for(const b of S.balls)b.hold+=COUNTDOWN;
}
// A player who left or stayed disconnected past the grace period is out of the round.
function eliminate(r,id){
 const S=r.sim,p=simPlayer(r,id);
 if(!p||p.out)return null;
 p.out=true;p.lives=0;
 S.balls=S.balls.filter(b=>!(b.held&&b.source===id));
 return {t:"out",owner:id};
}
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
export class BrickRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.room=null;this.loop=null;this.lastTick=0;this.lastSave=0;this.sent=null;this.pending=[];this.evCount={};ctx.blockConcurrencyWhile(async()=>{this.room=await ctx.storage.get("room")||null;if(this.room){
  if(!this.room.arena)this.room.arena=arenaLayout();
  // A room stored before the engine existed has no simulation to continue: it goes back to its lobby.
  if(this.room.status!=="waiting"&&!this.room.sim){this.room.status="waiting";this.room.board=bricks(this.room.seed||this.room.code.toLowerCase(),Math.max(2,this.room.players.length),this.room.arena);}
 }});}
 async save(){if(this.room){this.room.lastActivity=Date.now();await this.ctx.storage.put("room",this.room);}}
 liveIds(){return new Set(this.ctx.getWebSockets().filter(w=>w.readyState===1).map(w=>w.deserializeAttachment()?.id).filter(Boolean));}
 // Marks a player (dis)connected in the lobby roster and in the engine.
 setOnline(p,online){p.online=online;p.offlineAt=online?0:Date.now();const sp=simPlayer(this.room,p.id);if(sp)sp.online=online;}
 // The board as bricks currently stand: the engine's cells during and after a round, the lobby preview before one.
 hpNow(){const r=this.room;return r.sim?r.sim.hp:Uint8Array.from(r.board.hp,c=>c.charCodeAt(0)-48);}
 // Everything that never changes within a round.
 boardInfo(){const b=this.room.board;return {colors:b.colors,palette:b.palette,wallColors:b.wallColors,vaporPalette:b.vaporPalette,vaporWalls:b.vaporWalls,rootSemi:b.rootSemi,scale:b.scale,wave:b.wave,decay:b.decay,archetype:b.archetype,quad:b.quad,total:b.total};}
 // Compact live state. Balls are [x,y,vx,vy,server,held], capsules [x,y,kind,catcher], lasers [x,y,seat]; players are referred to by index.
 snapshot(withBoard=true){
  const r=this.room,S=r.sim,live=this.liveIds(),idx=new Map(r.players.map((p,i)=>[p.id,i])),at=id=>idx.get(id)??-1;
  const [lo,hi]=[40,544],edge=seat=>seat===0||seat===2?r.arena.width/2:(lo+hi)/2,pw=64*r.arena.cell/6;
  const state={code:r.code,status:r.status,hostId:r.hostId,round:r.round||0,arena:r.arena,seed:r.seed,mode:r.mode||"versus",set:r.set||"vintage",
   startedAt:r.startedAt,now:Date.now(),result:r.result||null,
   elapsed:r.startedAt?Math.max(0,Math.floor((((r.status==="finished"&&r.finishedAt)||Date.now())-r.startedAt)/1000)):0,
   players:r.players.map(p=>{
    const sp=S&&S.players.find(q=>q.id===p.id),o={id:p.id,name:p.name,seat:p.seat,online:live.has(p.id)};
    if(!sp)return {...o,out:0,lives:0,score:0,combo:0,c:edge(p.seat),pw,fx:{}};
    return {...o,out:outOf(S,sp)?1:0,lives:S.mode==="versus"?sp.lives:S.pool,score:sp.score,combo:sp.combo,c:num(sp.c),pw:num(sp.pw),fx:fxOf(sp.fx)};
   }),
   balls:S?S.balls.map(b=>[num(b.x),num(b.y),Math.round(b.vx),Math.round(b.vy),at(b.source),b.held?1:0]):[],
   pups:S?S.pups.map(u=>[num(u.x),num(u.y),u.k,at(u.owner)]):[],
   lasers:S?S.lasers.map(l=>[num(l.x),num(l.y),l.seat]):[],
   fx:S?fxOf(S.fx):{},lucky:S?S.luckyLeft:0,remaining:S?S.remaining:r.board.remaining,
   crush:S?[num(S.crush.kx,100),num(S.crush.bx,100),num(S.crush.ky,100),num(S.crush.by,100)]:[1,0,1,0]};
  if(withBoard)state.board={...this.boardInfo(),hp:Array.from(this.hpNow(),h=>h).join("")};
  return state;
 }
 // Records engine events for the next broadcast: enough for sounds, sparkles and the owner's own toasts.
 collect(events){
  const r=this.room,at=id=>r.players.findIndex(p=>p.id===id),cap={break:40,hit:16,paddle:8},n=this.evCount;
  for(const e of events){
   if(cap[e.t]&&(n[e.t]=(n[e.t]||0)+1)>cap[e.t])continue;
   switch(e.t){
    case"break":case"hit":this.pending.push({t:e.t,i:e.i,o:at(e.owner)});break;
    case"paddle":case"miss":case"out":case"crushed":case"serve":this.pending.push({t:e.t,o:at(e.owner)});break;
    case"life":this.pending.push({t:"life",o:at(e.owner),n:e.lives});break;
    case"power":this.pending.push({t:"power",o:at(e.owner),id:e.id,k:e.k,x:num(e.x),y:num(e.y)});break;
    case"crush":this.pending.push({t:"crush"});break;
    case"beam":this.pending.push({...e,x:e.x===undefined?undefined:num(e.x),y:e.y===undefined?undefined:num(e.y)});break;
    case"ring":this.pending.push({t:"ring",x:num(e.x),y:num(e.y),R:e.R,c:e.c});break;
   }
  }
 }
 // The full board goes out once per round; after that only the cells that changed.
 broadcast(){
  if(!this.room)return;
  const r=this.room,state=this.snapshot(false),hp=this.hpNow(),sent=this.sent;
  if(!sent||sent.code!==r.code||sent.round!==(r.round||0)||sent.hp.length!==hp.length)state.board={...this.boardInfo(),hp:Array.from(hp,h=>h).join("")};
  else{
   const cells=[];for(let i=0;i<hp.length;i++)if(hp[i]!==sent.hp[i])cells.push(i,hp[i]);
   if(cells.length)state.board={cells};
  }
  this.sent={code:r.code,round:r.round||0,hp:Uint8Array.from(hp)};
  if(this.pending.length){state.events=this.pending;this.pending=[];}
  this.evCount={};
  const data=JSON.stringify({type:"state",version:1,state});
  for(const ws of this.ctx.getWebSockets())if(ws.readyState===1)try{ws.send(data);}catch{}
 }
 async fetch(req){
  const parts=new URL(req.url).pathname.split("/").filter(Boolean),action=parts.at(-1),code=parts.at(-2);
  if(!/^[A-Z2-9]{6}$/.test(code||""))return reply({error:"Invalid room code"},400);
  if(action==="create"&&req.method==="POST"){
   if(this.room&&Date.now()-(this.room.lastActivity||0)<TTL)return reply({error:"Room already exists"},409);
   const data=await req.json().catch(()=>({})),name=nameOf(data.name);if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
   const p={id:crypto.randomUUID(),token:newToken(),name,seat:0,pos:.5};
   const arena=arenaLayout(Number(data.aspect));
   this.room={code,hostId:p.id,players:[p],status:"waiting",round:0,arena,board:bricks(code.toLowerCase(),2,arena),seed:code.toLowerCase(),startedAt:0,lastActivity:Date.now()};assignSides(this.room.players);this.sent=null;
   await this.save();return reply({code,you:p.id},201,{"set-cookie":cookieFor(code,p.token)});
  }
  if(!this.room||this.room.code!==code||Date.now()-this.room.lastActivity>TTL)return reply({error:"Room not found or expired"},404);
  const r=this.room,existing=r.players.find(p=>p.token===authToken(req,code));
  if(action==="join"&&req.method==="POST"){
   if(existing)return reply({code,you:existing.id,resumed:true},200,{"set-cookie":cookieFor(code,existing.token)});
   if(r.status==="playing")return reply({error:"A round is in progress. Try again when it ends."},409);
   if(r.players.length>=4)return reply({error:"This lobby is full (4/4)"},409);
   const body=await req.json().catch(()=>({})),name=nameOf(body.name);if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
   const player={id:crypto.randomUUID(),token:newToken(),name,seat:0,pos:.5};r.players.push(player);assignSides(r.players);
   if(r.status==="waiting"){r.board=bricks(r.seed||r.code.toLowerCase(),r.players.length,r.arena||arenaLayout());this.sent=null;}
   await this.save();this.broadcast();return reply({code,you:player.id,resumed:false},201,{"set-cookie":cookieFor(code,player.token)});
  }
  if(!existing)return reply({error:"Join the lobby first"},401);
  if(action==="rename"&&req.method==="POST"){
    const body=await req.json().catch(()=>({})),nextName=nameOf(body.name);
    if(!nextName)return reply({error:"Enter a name of 2–18 characters"},400);
    if(existing.name!==nextName){existing.name=nextName;await this.save();this.broadcast();}
    return reply({name:existing.name});
   }
   if(action==="state"&&req.method==="GET")return reply({you:existing.id,state:this.snapshot()});
  if(action==="socket"&&req.method==="GET"){
   if((req.headers.get("upgrade")||"").toLowerCase()!=="websocket")return reply({error:"WebSocket required"},426);
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);for(const old of this.ctx.getWebSockets())if(old.deserializeAttachment()?.id===existing.id)try{old.close(1000,"Reconnected");}catch{}this.ctx.acceptWebSocket(server);server.serializeAttachment({id:existing.id});existing.lastSeq=-1;this.setOnline(existing,true);
    server.send(JSON.stringify({type:"hello",version:1,you:existing.id,state:this.snapshot()}));this.broadcast();if(r.status==="playing")this.ensureLoop();
   return new Response(null,{status:101,webSocket:client});
  }
  if(action==="action"&&req.method==="POST"){
   if(r.hostId!==existing.id)return reply({error:"Only the lobby host can start the game"},403);
   const body=await req.json().catch(()=>({}));if(body.action!=="start"&&body.action!=="mode")return reply({error:"Unknown action"},400);
   if(r.status!=="waiting"&&r.status!=="finished")return reply({error:"Round already active"},409);
   if(body.action==="mode"){
    if(!MODES.includes(body.mode))return reply({error:"Unknown mode"},400);
    r.mode=body.mode;await this.save();this.broadcast();return reply({ok:true});
   }
   if(body.set!==undefined&&!SETS.includes(body.set))return reply({error:"Unknown power-up set"},400);
   const online=this.liveIds();if(r.players.filter(p=>online.has(p.id)).length<2)return reply({error:"At least two connected players are required"},409);
   for(const p of r.players)p.online=online.has(p.id);
   startRound(r,body.set);this.sent=null;this.pending=[];await this.save();this.broadcast();this.ensureLoop();return reply({ok:true});
  }
  if(action==="leave"&&req.method==="POST"){
   if(r.status==="playing"){
    const gone=eliminate(r,existing.id);if(gone)this.collect([gone]);
    if(r.hostId===existing.id){
     const online=this.liveIds();
     const nextHost=r.players.find(p=>p.id!==existing.id&&online.has(p.id))||r.players.find(p=>p.id!==existing.id);
     if(nextHost)r.hostId=nextHost.id;
    }
    await this.save();this.broadcast();
    return reply({ok:true,note:"Left the round"});
   }
   r.players=r.players.filter(p=>p.id!==existing.id);
   if(r.status==="waiting"&&r.players.length){
    assignSides(r.players);r.board=bricks(r.seed||r.code.toLowerCase(),Math.max(2,r.players.length),r.arena||arenaLayout());this.sent=null;
   }
   for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.id===existing.id)try{ws.close(1000,"Left lobby");}catch{}
   if(r.hostId===existing.id)r.hostId=r.players[0]?.id||null;
   if(!r.players.length){this.room=null;await this.ctx.storage.delete("room");}else await this.save();
   this.broadcast();return reply({ok:true},200,{"set-cookie":"brick_room_"+code+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});
  }
  return reply({error:"Route not found"},404);
 }
 async webSocketMessage(ws,data){
  if(typeof data!=="string"||data.length>300||!this.room)return;
  const r=this.room,p=r.players.find(v=>v.id===ws.deserializeAttachment()?.id);
  if(!p){ws.close(1008,"Seat removed");return;}
  let v;try{v=JSON.parse(data);}catch{return;}
  const S=r.sim,aim=typeof v?.aim==="number"&&Number.isFinite(v.aim)?clamp(v.aim,-MAX_AIM,MAX_AIM):null;
  if(v?.type==="paddle-input"&&v.version===1&&r.status==="playing"&&typeof v.pos==="number"&&Number.isFinite(v.pos)&&Number.isSafeInteger(v.seq)&&v.seq>(p.lastSeq??-1)){
   const now=Date.now();if(now-(p.lastInputAt||0)<25)return;
   p.pos=clamp(v.pos,0,1);p.lastSeq=v.seq;p.lastInputAt=now;
   E.setPaddle(S,p.id,E.paddleAt(S,p.id,p.pos));
   if(aim!==null)E.setAim(S,p.id,aim);
   if(!this.loop)this.ensureLoop();
  }else if(v?.type==="launch"&&v.version===1&&r.status==="playing"&&Date.now()>=r.startedAt){
   if(aim!==null)E.setAim(S,p.id,aim);
   E.launch(S,p.id);
  }else if(v?.type==="ping")ws.send(JSON.stringify({type:"pong"}));
 }
 async webSocketClose(ws,code,reason){try{ws.close(code,reason);}catch{}if(this.room){const p=this.room.players.find(p=>p.id===ws.deserializeAttachment()?.id);if(p&&!this.liveIds().has(p.id))this.setOnline(p,false);this.broadcast();if(this.liveIds().size===0){this.stopLoop();await this.save();}}}
 async webSocketError(ws){try{ws.close(1011,"Connection error");}catch{}if(this.room){const p=this.room.players.find(p=>p.id===ws.deserializeAttachment()?.id);if(p&&!this.liveIds().has(p.id))this.setOnline(p,false);this.broadcast();}}
 stopLoop(){if(this.loop!==null){clearInterval(this.loop);this.loop=null;}}
 ensureLoop(){
  if(this.loop!==null||!this.room||this.room.status!=="playing"||this.liveIds().size===0)return;
  this.lastTick=Date.now();this.lastSave=this.lastTick;
  this.loop=setInterval(()=>{
   if(!this.room||this.room.status!=="playing"||this.liveIds().size===0){this.stopLoop();return;}
   const now=Date.now(),dt=clamp((now-this.lastTick)/1000,0,.25);this.lastTick=now;
   this.step(dt,now);this.broadcast();
   if(now-this.lastSave>3000){this.lastSave=now;this.save().catch(e=>console.error("room.save",e));}
  },50);
 }
 step(dt,now){
  const r=this.room,S=r.sim;
  // A player who stays disconnected past the grace period is out, so a round without a timer can still end.
  for(const p of r.players)if(p.online===false&&now-(p.offlineAt||now)>OFFLINE_GRACE){const gone=eliminate(r,p.id);if(gone)this.collect([gone]);}
  // The engine runs at Solo's 60 steps a second whatever the broadcast rate is.
  const n=Math.max(1,Math.ceil(dt*60));
  for(let k=0;k<n&&S.status==="play";k++)this.collect(E.step(S,dt/n));
  if(S.status==="play"&&S.mode==="coop"&&S.players.every(p=>p.out)){S.status="over";S.result={reason:"allout"};S.pups=[];}
  if(S.status!=="play"){
   r.status="finished";r.finishedAt=Date.now();r.result=S.result;
   this.stopLoop();this.save().catch(e=>console.error("room.finish",e));
  }
 }
}
function fxOf(o){const f={};for(const k in o)if(o[k]>0)f[k]=num(o[k]);return f;}
function newCode(){const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);return Array.from(bytes,n=>ABC[n%ABC.length]).join("");}
function sameOrigin(request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin;}
function htmlResponse(html){return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-cache","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY"}});}

export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==="/"||path==="/multiplayer"||path==="/multiplayer/"||/^\/multiplayer\/[A-Z2-9]{6}\/?$/i.test(path))return htmlResponse(MULTIPLAYER_HTML.replace("<script>","<script>\n"+browserCoreSource+"\n"+engineSource+"\n"));
 if(!path.startsWith("/api/rooms/")&&path!=="/api/rooms")return reply({error:"Not found"},404);
 if((request.method==="POST"||request.headers.get("upgrade"))&&!sameOrigin(request))return reply({error:"Invalid origin"},403);
 if(request.method==="POST"&&Number(request.headers.get("content-length")||0)>1024)return reply({error:"Request too large"},413);
 if(path==="/api/rooms"&&request.method==="POST"){
  const body=await request.json().catch(()=>({})),name=nameOf(body.name);
  if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
  for(let i=0;i<6;i++){const id=newCode(),stub=env.ROOMS.get(env.ROOMS.idFromName(id)),response=await stub.fetch(new Request("https://room.internal/api/rooms/"+id+"/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})}));if(response.status===409)continue;return response;}
  return reply({error:"Could not allocate a room"},503);
 }
 const match=/^\/api\/rooms\/([A-Z2-9]{6})\/(join|rename|state|socket|action|leave)$/.exec(path);
 if(!match)return reply({error:"Not found"},404);
 return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
}};