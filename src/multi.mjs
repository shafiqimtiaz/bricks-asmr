import { DurableObject } from "cloudflare:workers";
const ABC="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",TTL=21600000;
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
function reply(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...extra}});}
function nameOf(v){if(typeof v!=="string")return "";const s=v.trim().normalize("NFKC");return /^[\p{L}\p{N} ._-]{2,18}$/u.test(s)?s:"";}
function cookieFor(code,t){return "brick_room_"+code+"="+t+"; Path=/; Max-Age=21600; HttpOnly; Secure; SameSite=Lax";}
function authToken(req,code){const raw=req.headers.get("cookie")||"",key="brick_room_"+code+"=";const v=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(key));return v?v.slice(key.length):"";}
function newToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");}

const BOARD={x:6,y:40,right:354,bottom:544,paddleBottom:535,paddleTop:36,paddleLeft:12,paddleRight:348};
const GRID_COLS=58,GRID_ROWS=64,GRID_SIZE=6,GRID_Y=40,GRID_X=6,MAX_BALLS=12;
function hash(value){let h=1779033703^value.length;for(let i=0;i<value.length;i++){h=Math.imul(h^value.charCodeAt(i),3432918353);h=h<<13|h>>>19;}h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^h>>>16)>>>0;}
function random(seed){let a=seed;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function bricks(seed,level){
 const COLS=GRID_COLS,ROWS=GRID_ROWS,N=COLS*ROWS;
 const SCALES=[[0,2,4,7,9],[0,3,5,7,10],[0,2,3,7,8],[0,2,4,6,7,9,11],[0,2,3,5,7,9,10],[0,4,5,7,11]];
 const PU_W=[14,12,10,9,8,8,8,7,6,6],PU_WSUM=PU_W.reduce((a,b)=>a+b,0);
 const pickPU=u=>{let x=u*PU_WSUM;for(let j=0;j<PU_W.length;j++){x-=PU_W[j];if(x<0)return j+1;}return 10;};
 const mulberry=random;
 let hp,col,pu,palette,wallCols,vPal,vWall,rootSemi,scale_,wave,decay,archetype,quad,remaining,total;
function genLevel(){
  const rng = mulberry(hash(seed + ':' + level));
  const R = (a,b) => a + rng() * (b - a), RI = (a,b) => Math.floor(R(a, b + 1));
  hp = new Uint8Array(N); col = new Uint8Array(N); pu = new Uint8Array(N);
  const region = new Int16Array(N).fill(1);  // 1 = outer fill
  const isWall = new Uint8Array(N);
  const hollow = new Uint8Array(N);
  let nextRegion = 2;

  // palette: muted, harmonious
  const baseH = R(0, 360), sat = R(18, 42), scheme = RI(0, 2);
  const hueFor = k => scheme === 0 ? baseH + k * 137.5 : scheme === 1 ? baseH + (k % 2 ? 180 : 0) + k * 12 : baseH + k * 28;
  palette = [];
  for (let k = 0; k < 16; k++) palette.push(`hsl(${hueFor(k) % 360},${sat + (k % 3) * 6}%,${R(36, 50)}%)`);
  wallCols = ['', `hsl(${baseH},4%,38%)`, `hsl(${baseH},5%,48%)`, `hsl(${baseH},6%,58%)`];
  { const vr = mulberry(hash(seed + ':' + level + ':vapor')), VH = [322, 292, 188, 265, 176, 338, 205], o = Math.floor(vr() * 7);
    vPal = []; for (let k = 0; k < 16; k++) vPal.push(`hsl(${VH[(k + o) % 7]},${68 + vr() * 18}%,${54 + vr() * 12}%)`);
    vWall = ['', '#4a2f78', '#6a46a3', '#8f6bd0']; }
  rootSemi = RI(0, 11) - 5;
  scale_ = SCALES[(level + RI(0, SCALES.length - 1)) % SCALES.length];
  wave = ['triangle', 'sine', 'triangle', 'square'][RI(0, 3)];
  decay = R(0.06, 0.16);

  // shapes
  const inside = (s, c, r) => {
    const dx = (c + .5 - s.cx) / s.w, dy = (r + .5 - s.cy) / s.h;
    if (s.t === 0) return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    if (s.t === 1) return dx*dx + dy*dy <= 1;
    if (s.t === 2) return Math.abs(dx) + Math.abs(dy) <= 1;
    return Math.max(Math.abs(dx), Math.abs(dy)) <= 1 && Math.abs(dx) + Math.abs(dy) <= 1.45; // octagon
  };
  function place(s, depth){
    const reg = nextRegion++ % 15 + 1, empty = rng() < 0.18;
    const c0 = Math.max(0, Math.floor(s.cx - s.w - 1)), c1 = Math.min(COLS - 1, Math.ceil(s.cx + s.w + 1));
    const r0 = Math.max(0, Math.floor(s.cy - s.h - 1)), r1 = Math.min(ROWS - 1, Math.ceil(s.cy + s.h + 1));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!inside(s, c, r)) continue;
      const i = r * COLS + c;
      const edge = !inside(s, c-1, r) || !inside(s, c+1, r) || !inside(s, c, r-1) || !inside(s, c, r+1);
      if (edge) { isWall[i] = 1; hollow[i] = 0; region[i] = reg; } else { isWall[i] = 0; region[i] = reg; hollow[i] = empty ? 1 : 0; }
    }
    if (depth < 3 && s.w > 6 && s.h > 6 && rng() < 0.7) {
      const k = rng() < 0.3 ? 2 : 1;
      for (let j = 0; j < k; j++) {
        const f = R(0.35, 0.65) / k;
        place({t: RI(0, 3), cx: s.cx + (k > 1 ? (j ? 1 : -1) * s.w * 0.45 : R(-.2, .2) * s.w), cy: s.cy + R(-.2, .2) * s.h, w: s.w * f * (k > 1 ? 0.9 : 1.4), h: s.h * f * 1.4}, depth + 1);
      }
    }
  }
  // archetype rotates per level so consecutive levels never share a layout family
  const ARCH = 8;
  archetype = (hash(seed) + level * 3) % ARCH;
  const setCell = (c, r, reg, wall, hol) => { const i = r * COLS + c; region[i] = reg; isWall[i] = wall; hollow[i] = hol; };
  if (archetype === 0) { // scattered nested shapes
    const nTop = RI(1, 4);
    for (let k = 0; k < nTop; k++) { const w = R(6, 22), h = R(6, 22); place({t: RI(0, 3), cx: R(w + 1, COLS - w - 1), cy: R(h + 1, ROWS - h - 1), w, h}, 0); }
  } else if (archetype === 1) { // concentric rings
    const t = RI(0, 3), cx = COLS / 2 + R(-6, 6), cy = ROWS / 2 + R(-6, 6), w = R(20, 30), h = R(22, 34), k = RI(3, 7);
    const metric = (dx, dy) => t === 0 ? Math.max(Math.abs(dx), Math.abs(dy)) : t === 1 ? Math.hypot(dx, dy) : t === 2 ? Math.abs(dx) + Math.abs(dy) : Math.max(Math.max(Math.abs(dx), Math.abs(dy)), (Math.abs(dx) + Math.abs(dy)) / 1.45);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const d = metric((c + .5 - cx) / w, (r + .5 - cy) / h); if (d > 1) continue;
      const ring = Math.floor(d * k), fr = d * k - ring, wt = k / Math.min(w, h) * 1.1;
      setCell(c, r, 2 + ring, fr < wt ? 1 : 0, 0);
    }
  } else if (archetype === 2) { // grid of chambers
    const m = RI(2, 4), n = RI(3, 5), cw = COLS / m, ch = ROWS / n, holl = [];
    for (let j = 0; j < m * n; j++) holl.push(rng() < 0.2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const bx = Math.floor(c / cw), by = Math.floor(r / ch), room = by * m + bx;
      const vEdge = c > 0 && Math.floor((c - 1) / cw) !== bx, hEdge = r > 0 && Math.floor((r - 1) / ch) !== by;
      const wall = vEdge || hEdge;
      setCell(c, r, 2 + room, wall ? 1 : 0, !wall && holl[room] ? 1 : 0);
    }
  } else if (archetype === 3) { // diamond lattice
    const k = RI(6, 12), off = RI(0, k - 1), m = RI(3, 5);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = c + r + off, v = c - r + 200 + off;
      const cell = Math.floor(u / k) + Math.floor(v / k);
      setCell(c, r, 2 + ((cell % m) + m) % m, u % k === 0 || v % k === 0 ? 1 : 0, 0);
    }
  } else if (archetype === 4) { // angled bands
    const th = R(0, Math.PI), bw = R(3, 7), every = RI(2, 4), hollowBand = RI(0, 6);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p = c * Math.cos(th) + r * Math.sin(th) + 200, band = Math.floor(p / bw), fr = p - band * bw;
      setCell(c, r, 2 + (band % 6), band % every === 0 && fr < 1 ? 1 : 0, band % 9 === hollowBand ? 1 : 0);
    }
  } else if (archetype === 5) { // mosaic blocks
    const k = RI(3, 7), mode = RI(0, 2), hp_ = R(0.05, 0.18), wallP = R(0.08, 0.25);
    const bh = new Map();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const bx = Math.floor(c / k), by = Math.floor(r / k), key = bx * 100 + by;
      if (!bh.has(key)) bh.set(key, [rng() < hp_, rng() < wallP]);
      const [hol, walled] = bh.get(key);
      const reg = mode === 0 ? (bx + by) % 2 : mode === 1 ? (bx * by) % 4 : (bx + 2 * by) % 5;
      const edge = c % k === 0 || r % k === 0 || c % k === k - 1 || r % k === k - 1;
      setCell(c, r, 2 + reg, walled && edge ? 1 : 0, hol && !(walled && edge) ? 1 : 0);
    }
  } else if (archetype === 6) { // organic noise regions
    const gs = RI(5, 9), gw = Math.ceil(COLS / gs) + 2, gh = Math.ceil(ROWS / gs) + 2, g = [];
    for (let j = 0; j < gw * gh; j++) g.push(rng());
    const K = RI(3, 6), noise = (c, r) => { const x = c / gs, y = r / gs, x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), v = (a, b) => g[b * gw + a];
      return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy; };
    const lv = (c, r) => Math.min(K - 1, Math.floor(noise(c, r) * K));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const l = lv(c, r), edge = (c < COLS - 1 && lv(c + 1, r) !== l) || (r < ROWS - 1 && lv(c, r + 1) !== l);
      setCell(c, r, 2 + l, edge ? 1 : 0, l === 0 && rng() < 0.6 ? 1 : 0);
    }
  } else { // spiral
    const cx = COLS / 2 + R(-5, 5), cy = ROWS / 2 + R(-5, 5), b = R(4, 7), dir = rng() < .5 ? 1 : -1, arms = RI(1, 2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const dx = c + .5 - cx, dy = (r + .5 - cy), d = Math.hypot(dx, dy), a = (Math.atan2(dy, dx) * dir + Math.PI) / (Math.PI * 2);
      const u = d - b * a / arms, turn = Math.floor(u / b), fr = u - turn * b;
      setCell(c, r, 2 + ((turn % 6) + 6) % 6, fr < 1.1 && d > 3 ? 1 : 0, 0);
    }
  }
  // needle slits: clean 1-cell holes in straight wall runs, evenly spaced (left half, mirrored later)
  const W_ = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS && isWall[r * COLS + c] === 1;
  const slitP = R(0.05, 0.12), minGap = RI(4, 7), slits = [];
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS / 2; c++) {
    if (!W_(c, r)) continue;
    const horiz = W_(c - 1, r) && W_(c + 1, r) && !W_(c, r - 1) && !W_(c, r + 1);
    const vert = W_(c, r - 1) && W_(c, r + 1) && !W_(c - 1, r) && !W_(c + 1, r);
    const n4 = W_(c - 1, r) + W_(c + 1, r) + W_(c, r - 1) + W_(c, r + 1);
    const diag = n4 <= 2 && ((!W_(c - 1, r - 1) && !W_(c + 1, r + 1)) || (!W_(c + 1, r - 1) && !W_(c - 1, r + 1)));
    if (!(horiz || vert || diag) || rng() >= slitP) continue;
    if (slits.some(([sc, sr]) => Math.abs(sc - c) + Math.abs(sr - r) < minGap)) continue;
    slits.push([c, r]); isWall[r * COLS + c] = 0; hollow[r * COLS + c] = 1;
  }
  // thin snaking corridors (1-2 cells), some starting from the bottom edge
  const nCor = RI(1, 4);
  for (let k = 0; k < nCor; k++) {
    let c = RI(2, COLS - 3), r = rng() < 0.6 ? ROWS - 1 : RI(5, ROWS - 5);
    let d = r === ROWS - 1 ? 0 : RI(0, 3);
    const wide = rng() < 0.35 ? 2 : 1, len = RI(40, 160);
    const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
    for (let t = 0; t < len; t++) {
      for (let a = 0; a < wide; a++) for (let b2 = 0; b2 < wide; b2++) {
        const cc = c + a, rr = r + b2;
        if (cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS) { const i = rr * COLS + cc; hollow[i] = 1; isWall[i] = 0; }
      }
      if (rng() < 0.12) d = (d + (rng() < .5 ? 1 : 3)) % 4;
      const nc = c + DIRS[d][0], nr = r + DIRS[d][1];
      if (nc < 0 || nc > COLS - wide || nr < 2 || nr > ROWS - 1) { d = (d + 2) % 4; continue; }
      c = nc; r = nr;
    }
  }
  // symmetry: always left-right; some levels four-way (bottom half mirrored to top)
  quad = rng() < 0.35;
  const copy = (a, b) => { region[b] = region[a]; isWall[b] = isWall[a]; hollow[b] = hollow[a]; };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS / 2; c++) copy(r * COLS + c, r * COLS + COLS - 1 - c);
  if (quad) for (let r = 0; r < ROWS / 2; r++) for (let c = 0; c < COLS; c++) copy((ROWS - 1 - r) * COLS + c, r * COLS + c);
  // narrow trap gap above the bricks
  const topGap = RI(1, 2);
  for (let i = 0; i < topGap * COLS; i++) { hollow[i] = 1; isWall[i] = 0; }

  // fill
  const density = R(0.006, 0.014);
  remaining = 0;
  for (let i = 0; i < N; i++) {
    if (hollow[i]) continue;
    if (isWall[i]) { hp[i] = 3; col[i] = 0; }
    else { hp[i] = 1; col[i] = region[i]; }
    remaining++;
    const w = (region[i] > 1 ? 2.2 : 1) * ((i / COLS | 0) > ROWS * 0.55 ? 1.6 : 1);
    const c = i % COLS, r = (i / COLS) | 0;
    if (c >= COLS / 2) pu[i] = pu[r * COLS + COLS - 1 - c];
    else if (!isWall[i] && rng() < density * w) pu[i] = pickPU(rng());
  }
  // starters: 2 mirrored pairs in the first (lowest) row of bricks
  for (let r = ROWS - 1; r >= 0; r--) {
    const cand = [];
    for (let c = 0; c < COLS / 2 - 1; c++) { const i = r * COLS + c; if (hp[i] === 1) cand.push(i); }
    if (cand.length < 2) continue;
    const a = cand.splice(Math.floor(rng() * cand.length), 1)[0];
    const far = cand.filter(i => Math.abs(i - a) > 2), b = (far.length ? far : cand)[Math.floor(rng() * (far.length || cand.length))];
    for (const i of [a, b]) { const c = i % COLS; pu[i] = 11; pu[r * COLS + COLS - 1 - c] = 11; }
    break;
  }
  total = remaining;
}
 genLevel();
 return {
  hp:Array.from(hp,x=>String(x)).join(""),
  colors:Array.from(col,x=>x.toString(16)).join(""),
  powerups:Array.from(pu,x=>x.toString(16)).join(""),
  palette,wallColors:wallCols,vaporPalette:vPal,vaporWalls:vWall,
  total,remaining
 };
}
function assignedSides(n){return n===1?[0]:n===2?[0,2]:n===3?[0,1,3]:[0,1,2,3];}
function assignSides(players){const sides=assignedSides(players.length);players.forEach((p,i)=>{p.seat=sides[i];p.pos=.5;});}
function resetBall(room){
 const a=((room.hits*47+19)%75-37)*Math.PI/180,speed=330;
 room.balls=[{x:180,y:500,vx:Math.sin(a)*speed,vy:-Math.cos(a)*speed,owner:null}];
}
function startRound(r){
 r.status="playing";r.round=(r.round||0)+1;r.seed=r.code.toLowerCase();r.level=1;
 r.startedAt=Date.now();r.endsAt=r.startedAt+90000;
 r.board=bricks(r.seed,r.level);r.hits=0;r.lastTouch=null;
 for(const p of r.players){p.score=0;p.lives=3;p.pos=.5;p.lastSeq=-1;p.lastInputAt=0;}
 resetBall(r);
}
function miss(r,p){p.lives=Math.max(0,p.lives-1);resetBall(r);}
function paddleFor(r,side){return r.players.find(p=>p.seat===side&&p.lives>0&&p.online!==false)||null;}
function advanceBall(r,ball,step){
 const prevX=ball.x,prevY=ball.y;
 ball.x+=ball.vx*step;ball.y+=ball.vy*step;
 const col=Math.floor((ball.x-GRID_X)/GRID_SIZE),row=Math.floor((ball.y-GRID_Y)/GRID_SIZE);
 if(col>=0&&col<GRID_COLS&&row>=0&&row<GRID_ROWS){
  const idx=row*GRID_COLS+col,life=r.board.hp.charCodeAt(idx)-48;
  if(life>0){
   r.board.hp=r.board.hp.slice(0,idx)+(life-1)+r.board.hp.slice(idx+1);
   if(life===1)r.board.remaining--;
   r.hits++;
   const scorer=r.players.find(p=>p.id===ball.owner);
   if(scorer)scorer.score+=life===1?10:3;
   const oldCol=Math.floor((prevX-GRID_X)/GRID_SIZE);
   if(oldCol!==col)ball.vx=-ball.vx;else ball.vy=-ball.vy;
   ball.x=prevX;ball.y=prevY;
   if(r.hits%60===0&&r.balls.length<MAX_BALLS){
    const speed=Math.hypot(ball.vx,ball.vy),angle=(r.hits%2?.72:-.72);
    r.balls.push({x:ball.x,y:ball.y,vx:Math.cos(angle)*ball.vx-Math.sin(angle)*ball.vy,vy:Math.sin(angle)*ball.vx+Math.cos(angle)*ball.vy,owner:ball.owner});
   }
   return;
  }
 }
 const edge=2.7,half=36;
 const hit=(seat,coord)=>{
  const p=paddleFor(r,seat);if(!p)return false;
  const center=(seat===0||seat===2)?42+p.pos*276:84+p.pos*416;
  if(Math.abs(coord-center)>half+edge){miss(r,p);return true;}
  const deflect=clamp((coord-center)/half,-1,1);
  ball.owner=p.id;p.score+=2;
  if(seat===0||seat===2){
   ball.vy=seat===0?-Math.abs(ball.vy):Math.abs(ball.vy);
   ball.vx=clamp(ball.vx+deflect*120,-340,340);
  }else{
   ball.vx=seat===1?Math.abs(ball.vx):-Math.abs(ball.vx);
   ball.vy=clamp(ball.vy+deflect*120,-340,340);
  }
  return false;
 };
 if(ball.y>=BOARD.paddleBottom-edge&&ball.vy>0){
  ball.y=BOARD.paddleBottom-edge;if(hit(0,ball.x))return true;
  if(!paddleFor(r,0))ball.vy=-Math.abs(ball.vy);
 }else if(ball.y<=BOARD.paddleTop+edge&&ball.vy<0){
  ball.y=BOARD.paddleTop+edge;if(hit(2,ball.x))return true;
  if(!paddleFor(r,2))ball.vy=Math.abs(ball.vy);
 }
 if(ball.x<=BOARD.paddleLeft+edge&&ball.vx<0){
  ball.x=BOARD.paddleLeft+edge;if(hit(1,ball.y))return true;
  if(!paddleFor(r,1))ball.vx=Math.abs(ball.vx);
 }else if(ball.x>=BOARD.paddleRight-edge&&ball.vx>0){
  ball.x=BOARD.paddleRight-edge;if(hit(3,ball.y))return true;
  if(!paddleFor(r,3))ball.vx=-Math.abs(ball.vx);
 }
 return false;
}

function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
export class BrickRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.room=null;this.loop=null;this.lastTick=0;this.lastSave=0;ctx.blockConcurrencyWhile(async()=>{this.room=await ctx.storage.get("room")||null;});}
 async save(){if(this.room){this.room.lastActivity=Date.now();await this.ctx.storage.put("room",this.room);}}
 liveIds(){return new Set(this.ctx.getWebSockets().filter(w=>w.readyState===1).map(w=>w.deserializeAttachment()?.id).filter(Boolean));}
 snapshot(){const r=this.room,live=this.liveIds();return {code:r.code,status:r.status,hostId:r.hostId,round:r.round||0,hits:r.hits||0,seed:r.seed,level:r.level,startedAt:r.startedAt,remaining:r.endsAt?Math.max(0,Math.ceil((r.endsAt-Date.now())/1000)):90,players:r.players.map(p=>({id:p.id,name:p.name,seat:p.seat,pos:p.pos,score:p.score,lives:p.lives,online:live.has(p.id)})),board:r.board||null,balls:r.balls||[]};}
 broadcast(){if(!this.room)return;const data=JSON.stringify({type:"state",version:1,state:this.snapshot()});for(const ws of this.ctx.getWebSockets())if(ws.readyState===1)try{ws.send(data);}catch{}}
 async fetch(req){
  const parts=new URL(req.url).pathname.split("/").filter(Boolean),action=parts.at(-1),code=parts.at(-2);
  if(!/^[A-Z2-9]{6}$/.test(code||""))return reply({error:"Invalid room code"},400);
  if(action==="create"&&req.method==="POST"){
   if(this.room&&Date.now()-(this.room.lastActivity||0)<TTL)return reply({error:"Room already exists"},409);
   const data=await req.json().catch(()=>({})),name=nameOf(data.name);if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
   const p={id:crypto.randomUUID(),token:newToken(),name,seat:0,pos:.5,score:0,lives:3};
   this.room={code,hostId:p.id,players:[p],status:"waiting",round:0,hits:0,balls:[],board:bricks(code.toLowerCase(),1),seed:code.toLowerCase(),level:1,startedAt:0,endsAt:0,lastActivity:Date.now()};assignSides(this.room.players);resetBall(this.room);
   await this.save();return reply({code,you:p.id},201,{"set-cookie":cookieFor(code,p.token)});
  }
  if(!this.room||this.room.code!==code||Date.now()-this.room.lastActivity>TTL)return reply({error:"Room not found or expired"},404);
  const r=this.room,existing=r.players.find(p=>p.token===authToken(req,code));
  if(action==="join"&&req.method==="POST"){
   if(existing)return reply({code,you:existing.id},200,{"set-cookie":cookieFor(code,existing.token)});
   if(r.status!=="waiting")return reply({error:"This round has already started"},409);
   if(r.players.length>=4)return reply({error:"This lobby is full (4/4)"},409);
   const body=await req.json().catch(()=>({})),name=nameOf(body.name);if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
   const player={id:crypto.randomUUID(),token:newToken(),name,seat:0,pos:.5,score:0,lives:3};r.players.push(player);assignSides(r.players);
   await this.save();this.broadcast();return reply({code,you:player.id},201,{"set-cookie":cookieFor(code,player.token)});
  }
  if(!existing)return reply({error:"Join the lobby first"},401);
  if(action==="state"&&req.method==="GET")return reply({you:existing.id,state:this.snapshot()});
  if(action==="socket"&&req.method==="GET"){
   if((req.headers.get("upgrade")||"").toLowerCase()!=="websocket")return reply({error:"WebSocket required"},426);
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);for(const old of this.ctx.getWebSockets())if(old.deserializeAttachment()?.id===existing.id)try{old.close(1000,"Reconnected");}catch{}this.ctx.acceptWebSocket(server);server.serializeAttachment({id:existing.id});existing.lastSeq=-1;existing.online=true;
   server.send(JSON.stringify({type:"hello",version:1,you:existing.id,state:this.snapshot()}));this.broadcast();if(r.status==="playing")this.ensureLoop();
   return new Response(null,{status:101,webSocket:client});
  }
  if(action==="action"&&req.method==="POST"){
   if(r.hostId!==existing.id)return reply({error:"Only the lobby host can start the game"},403);
   const body=await req.json().catch(()=>({}));if(body.action!=="start")return reply({error:"Unknown action"},400);
   if(r.status!=="waiting"&&r.status!=="finished")return reply({error:"Round already active"},409);
   const online=this.liveIds();if(r.players.filter(p=>online.has(p.id)).length<2)return reply({error:"At least two connected players are required"},409);
   startRound(r);await this.save();this.broadcast();this.ensureLoop();return reply({ok:true});
  }
  if(action==="leave"&&req.method==="POST"){
   if(r.status==="playing")return reply({ok:true,note:"Seat reserved for reconnection"});
   r.players=r.players.filter(p=>p.id!==existing.id);if(r.status==="waiting")assignSides(r.players);
   for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.id===existing.id)try{ws.close(1000,"Left lobby");}catch{}
   if(r.hostId===existing.id)r.hostId=r.players[0]?.id||null;
   if(!r.players.length){this.room=null;await this.ctx.storage.delete("room");}else await this.save();
   this.broadcast();return reply({ok:true},200,{"set-cookie":"brick_room_"+code+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});
  }
  return reply({error:"Route not found"},404);
 }
 async webSocketMessage(ws,data){
  if(typeof data!=="string"||data.length>300||!this.room)return;
  const p=this.room.players.find(v=>v.id===ws.deserializeAttachment()?.id);
  if(!p){ws.close(1008,"Seat removed");return;}
  let v;try{v=JSON.parse(data);}catch{return;}
  if(v?.type==="paddle-input"&&v.version===1&&this.room.status==="playing"&&typeof v.pos==="number"&&Number.isFinite(v.pos)&&Number.isSafeInteger(v.seq)&&v.seq>(p.lastSeq??-1)){
   const now=Date.now();if(now-(p.lastInputAt||0)<25)return;
   p.pos=clamp(v.pos,0,1);p.lastSeq=v.seq;p.lastInputAt=now;
   if(!this.loop)this.ensureLoop();
  }else if(v?.type==="ping")ws.send(JSON.stringify({type:"pong"}));
 }
 async webSocketClose(ws,code,reason){try{ws.close(code,reason);}catch{}if(this.room){const p=this.room.players.find(p=>p.id===ws.deserializeAttachment()?.id);if(p&&!this.liveIds().has(p.id))p.online=false;this.broadcast();if(this.liveIds().size===0){this.stopLoop();await this.save();}}}
 async webSocketError(ws){try{ws.close(1011,"Connection error");}catch{}if(this.room){const p=this.room.players.find(p=>p.id===ws.deserializeAttachment()?.id);if(p&&!this.liveIds().has(p.id))p.online=false;this.broadcast();}}
 stopLoop(){if(this.loop!==null){clearInterval(this.loop);this.loop=null;}}
 ensureLoop(){
  if(this.loop!==null||!this.room||this.room.status!=="playing"||this.liveIds().size===0)return;
  this.lastTick=Date.now();this.lastSave=this.lastTick;
  this.loop=setInterval(()=>{
   if(!this.room||this.room.status!=="playing"||this.liveIds().size===0){this.stopLoop();return;}
   const now=Date.now(),dt=clamp((now-this.lastTick)/1000,0,.05);this.lastTick=now;
   this.step(dt,now);this.broadcast();
   if(now-this.lastSave>3000){this.lastSave=now;this.save().catch(e=>console.error("room.save",e));}
  },50);
 }
 step(dt,now){
  const r=this.room;
  if(!r.board||!r.balls?.length){r.board=bricks(r.seed||r.code.toLowerCase(),r.level||1);resetBall(r);}
  if(now>=r.endsAt||r.board.remaining===0){
   r.status="finished";this.stopLoop();this.save().catch(e=>console.error("room.finish",e));return;
  }
  const count=Math.max(1,Math.ceil(dt/(1/120))),t=dt/count;
  for(let tick=0;tick<count;tick++){
   for(const b of [...r.balls]){if(advanceBall(r,b,t))break;}
  }
 }

}
function newCode(){const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);return Array.from(bytes,n=>ABC[n%ABC.length]).join("");}
function sameOrigin(request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin;}
function htmlResponse(html){return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-cache","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY"}});}

const MULTIPLAYER_HTML="<!DOCTYPE html><html lang=\"en\"><head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>Brick ASMR</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin=\"\">\n<link href=\"https://fonts.googleapis.com/css2?family=Press+Start+2P&amp;display=swap\" rel=\"stylesheet\">\n<style>\n  html,body{margin:0;padding:0;position:fixed;inset:0;width:100%;height:100%;background:#0c0c0c;overflow:hidden;overscroll-behavior:none;touch-action:none;-webkit-user-select:none;user-select:none;font-family:'Press Start 2P',ui-monospace,monospace}\n  #wrap{--u:3.6px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:225px;height:400px;background:#1b1b1b;overflow:hidden}\n  canvas{position:absolute;inset:0;display:block;width:100%;height:100%}\n  #g{visibility:hidden}\n  #hud{position:absolute;left:0;right:0;top:0;display:flex;white-space:nowrap;align-items:center;gap:calc(var(--u)*1.2);padding:calc(var(--u)*1.4) calc(var(--u)*1.4);box-sizing:border-box;color:#cfcfcf;font-size:calc(var(--u)*2.2);text-shadow:0 0 4px #fff6;pointer-events:none}\n  #hud span{min-width:0;overflow:hidden;flex-shrink:1}\n  #hud .sp{flex:1}\n  #hud button{flex-shrink:0}\n  #hud button{font-size:inherit;pointer-events:auto;background:#2a2a2a;color:#ddd;border:1px solid #444;border-radius:calc(var(--u)*1.4);padding:calc(var(--u)*1) calc(var(--u)*1.2);font:inherit;cursor:pointer}\n  #crt{position:fixed;inset:0;z-index:5;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.22) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%);animation:flick 4s steps(60) infinite;mix-blend-mode:multiply}\n  #crt::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.035) 50%,transparent);background-size:100% 18%;background-repeat:no-repeat;animation:roll 7s linear infinite}\n  @keyframes flick{0%,100%{opacity:1}50%{opacity:.93}}\n  @keyframes roll{from{background-position:0 -20%}to{background-position:0 120%}}\n  body.clean{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}\n  body.clean #hud{font-size:calc(var(--u)*2.6);text-shadow:none}\n  body.clean #crt{display:none}\n  body.vintage{background:#030403}\n  body.vintage #wrap{border-radius:3.5% / 2%;overflow:hidden;box-shadow:0 0 60px rgba(150,255,190,.07)}\n  body.vapor{background:#07010f}\n  body.vapor #wrap{box-shadow:0 0 50px rgba(255,113,206,.25)}\n  body.vapor #crt{background:repeating-linear-gradient(to bottom,rgba(20,0,40,.14) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 60%,rgba(40,0,70,.5) 100%)}\n  body.vapor #hud{color:#ffd6f5;text-shadow:0 0 6px #ff71ce}\n  body.vapor #hud button{background:#2a0b45;color:#9ff3ff;border-color:#ff71ce}\n  #panel{position:absolute;left:7%;right:7%;top:18%;z-index:4;background:rgba(8,8,12,.93);border:1px solid #555;border-radius:10px;padding:14px 12px;color:#eee;text-align:center;font-size:calc(var(--u)*2.5);line-height:1.6;box-shadow:0 0 24px #000a;max-height:70%;overflow:hidden;box-sizing:border-box}\n  #panel[hidden]{display:none}\n  #ptitle{font-size:1.25em;margin-bottom:6px;letter-spacing:.05em}\n  #panel .tabs{display:flex;gap:6px;justify-content:center;margin-bottom:6px}\n  #panel .tabs button{padding:calc(var(--u)*1) calc(var(--u)*2.4);opacity:.55}\n  #panel .tabs button.on{opacity:1;border-color:#aaa}\n  #plist li.go{cursor:pointer}\n  #plist{max-height:calc(var(--u)*62);overflow-y:auto}\n  #ptime{font-size:2.1em;margin:4px 0 2px;color:#fff;text-shadow:0 0 8px #fff8}\n  #pnote{min-height:1.6em;color:#ffd166}\n  #plist{list-style:none;margin:10px 0;padding:0;text-align:left}\n  #plist li{display:flex;gap:8px;padding:3px 6px;border-radius:4px}\n  #plist li.me{background:#ffffff1a;color:#ffd166}\n  #plist .rk{width:2.2em;color:#888}#plist .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n  #plist .empty{color:#888;justify-content:center}\n  #panel .pb{display:flex;gap:8px;justify-content:center;margin-top:6px}\n  #panel button{font:inherit;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:6px;padding:calc(var(--u)*1.8) calc(var(--u)*3);cursor:pointer}\n  body.vapor #panel{background:rgba(26,5,51,.93);border-color:#ff71ce;box-shadow:0 0 24px #ff71ce55}\n  body.vapor #panel button{background:#2a0b45;color:#9ff3ff;border-color:#ff71ce}\n  body.vapor #ptime{color:#9ff3ff;text-shadow:0 0 10px #01cdfe}\n  body.vapor #pnote,body.vapor #plist li.me{color:#ff9de0}\n  #toast{z-index:6;position:absolute;left:50%;top:calc(var(--u)*11);transform:translateX(-50%);background:#000c;color:#fff;padding:6px 10px;border-radius:6px;font-size:calc(var(--u)*3);opacity:0;transition:opacity .3s;pointer-events:none;max-width:90%;word-break:break-all;text-align:center}\n\n#panel{display:flex;flex-direction:column;gap:calc(var(--u)*1);max-height:78%;overflow:hidden}\n#panel[hidden]{display:none}\n#plist{flex:1;min-height:0;max-height:none;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}\n#plist li{align-items:center;min-width:0}\n#plist .nm{white-space:normal;text-overflow:clip;overflow-wrap:break-word;line-height:1.55}\n#lbidentity{display:flex;gap:5px;justify-content:space-between;margin-bottom:4px}\n#lbidentity button,#lbidentity a{font:inherit;display:inline-flex;align-items:center;justify-content:center;border:1px solid #586558;border-radius:5px;padding:calc(var(--u)*1.4) calc(var(--u)*2);background:#243027;color:#f1f5e9;min-height:calc(var(--u)*8);text-decoration:none;font-size:.8em}\n#lbidentity button{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n#lbidentity a{white-space:nowrap}\n#panel .pb{flex-wrap:wrap;gap:4px}\n#panel .tabs button,#panel .pb button{min-height:calc(var(--u)*8)}\n\nbody{--lb-accent:#ff8f80;--lb-secondary:#6cd8ff;--lb-line:#416171;--lb-panel:rgba(7,10,13,.97);--lb-soft:#b2bfcc}\nbody.clean{--lb-accent:#f5f5f2;--lb-secondary:#cad8e0;--lb-line:#596169;--lb-panel:rgba(16,18,20,.97);--lb-soft:#b8bdc2}\nbody.vintage{--lb-accent:#ff8f80;--lb-secondary:#6cd8ff;--lb-line:#4d6973;--lb-panel:rgba(8,11,15,.97);--lb-soft:#a9bdc9}\nbody.vapor{--lb-accent:#ff71ce;--lb-secondary:#01cdfe;--lb-line:#794692;--lb-panel:rgba(19,6,35,.97);--lb-soft:#c8a9db}\nbody.clean #panel,body.vintage #panel,body.vapor #panel{\n top:15%;left:6%;right:6%;max-height:77%;padding:calc(var(--u)*3.2) calc(var(--u)*2.6);\n background:var(--lb-panel);border:1px solid var(--lb-line);border-radius:4px;\n box-shadow:0 0 0 2px #000a,0 0 24px #000a;\n color:#f6f7fa;overflow:hidden\n}\nbody.vintage #panel{box-shadow:0 0 0 2px #000a,0 0 27px #58c9fa22}\nbody.vapor #panel{box-shadow:0 0 0 2px #000a,0 0 27px #ff71ce33}\n#panel::before{content:\"\";height:3px;display:block;margin:calc(var(--u)*-3.2) calc(var(--u)*-2.6) calc(var(--u)*2.7);background:repeating-linear-gradient(90deg,var(--lb-secondary) 0 11px,transparent 11px 15px,var(--lb-accent) 15px 25px,transparent 25px 30px)}\n#ptitle{color:var(--lb-accent);font-size:.9em;line-height:1.8;letter-spacing:.02em;text-shadow:none;margin-bottom:calc(var(--u)*1.5)}\n#panel .tabs{padding-bottom:calc(var(--u)*2);border-bottom:1px solid var(--lb-line);margin-bottom:calc(var(--u)*2)}\n#panel .tabs button{min-height:calc(var(--u)*7.8);border-radius:2px;opacity:.9;color:var(--lb-soft)}\n#panel .tabs button.on{opacity:1;background:var(--lb-accent);border-color:var(--lb-accent);color:#0d0c11}\nbody.clean #panel .tabs button.on{color:#111}\nbody.vapor #panel .tabs button{background:#28113d}\nbody.vapor #panel .tabs button.on{background:var(--lb-accent);border-color:var(--lb-accent);color:#16051c}\nbody.vapor #panel .tabs button:not(.on){color:var(--lb-secondary)}\n#lbidentity{border-bottom:1px solid var(--lb-line);padding-bottom:calc(var(--u)*2);margin-bottom:calc(var(--u)*1.1)}\n#lbidentity button,#lbidentity a{background:transparent;border:1px solid var(--lb-line);color:var(--lb-soft);border-radius:2px;min-height:calc(var(--u)*7.8);padding:0 calc(var(--u)*2);font-size:.75em}\n#lbidentity a{color:var(--lb-secondary)}\n#lbidentity button:hover,#lbidentity a:hover{border-color:var(--lb-secondary)}\nbody.vapor #lbidentity button,body.vapor #lbidentity a{background:transparent}\n#ptime{font-size:1.85em;margin:calc(var(--u)*1.5) 0;color:var(--lb-secondary);text-shadow:none}\nbody.vintage #ptime{color:var(--lb-secondary);text-shadow:0 0 8px #53caff40}\nbody.vapor #ptime{color:var(--lb-secondary);text-shadow:0 0 8px #01cdfe55}\n#pnote,body.vapor #pnote{font-size:.89em;line-height:1.65;color:var(--lb-accent);min-height:1.5em}\n#plist{padding:0;margin:calc(var(--u)*2) 0;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}\n#plist li{min-height:calc(var(--u)*7);border:0;border-bottom:1px solid var(--lb-line);padding:calc(var(--u)*1.6) calc(var(--u)*1.2);border-radius:0;gap:calc(var(--u)*2);line-height:1.6}\n#plist li:last-child{border-bottom:0}\n#plist li.me{background:color-mix(in srgb,var(--lb-secondary) 13%,transparent);color:var(--lb-secondary)}\n#plist .rk{color:var(--lb-secondary);flex-shrink:0}\n#plist .nm{flex:1;min-width:0;white-space:normal;overflow-wrap:break-word}\n#plist li.empty{color:var(--lb-soft);justify-content:center}\n#panel .pb{border-top:1px solid var(--lb-line);padding-top:calc(var(--u)*2);gap:calc(var(--u)*1.3);margin-top:0}\n#panel .pb button{border-radius:2px;border-color:var(--lb-line);background:transparent;color:var(--lb-soft);min-height:calc(var(--u)*7.8)}\nbody.vapor #panel .pb button{background:transparent;border-color:var(--lb-line);color:var(--lb-soft)}\n#panel .pb button:hover{border-color:var(--lb-secondary);color:var(--lb-secondary)}\n#panel .pb #pnext{border-color:var(--lb-accent);color:var(--lb-accent)}\nbody.vapor #panel .pb #pnext{border-color:var(--lb-accent);color:var(--lb-accent)}\n\n\n\n[hidden]{display:none!important}\n#hud{z-index:3}\n#hud a{flex-shrink:0;font-size:inherit;pointer-events:auto;background:#2a2a2a;color:#ddd;border:1px solid #444;border-radius:calc(var(--u)*1.4);padding:calc(var(--u)*1) calc(var(--u)*1.2);font:inherit;text-decoration:none}\n#panel{top:12%!important;left:7%!important;right:7%!important;max-height:77%!important;overflow:auto!important;gap:calc(var(--u)*2.5)!important;padding:calc(var(--u)*3.6) calc(var(--u)*3.2)!important;font-size:calc(var(--u)*2.5);scrollbar-width:thin}\n#panel::before{margin:calc(var(--u)*-3.6) calc(var(--u)*-3.2) 0}\n#panel h1,#panel h2,#panel p{margin:0}\n#panel h1{font-size:1.55em;line-height:1.5;letter-spacing:.025em}\n#panel h2{font-size:1.05em;line-height:1.5}\n#panel p{font-size:.9em;line-height:1.75;color:var(--lb-soft)}\n#panel label{display:block;color:var(--lb-secondary);text-align:left;margin-top:calc(var(--u)*1)}\n#panel input{display:block;width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lb-line);border-radius:4px;background:#0a0c10;color:#f5f6f9;font:inherit;font-size:1.05em;margin:calc(var(--u)*1.5) 0;padding:calc(var(--u)*2.3);outline:none}\n#panel input:focus{border-color:var(--lb-secondary)}\n#panel button{border-radius:4px;border-color:var(--lb-line);font-size:1em;min-height:calc(var(--u)*8.5);padding:calc(var(--u)*1.8) calc(var(--u)*2.5);background:#25282b;color:#f4f4f4}\n#panel button.primary{background:var(--lb-accent);border-color:var(--lb-accent);color:#111}\n#panel button:disabled{opacity:.4;cursor:not-allowed}\n#panel .label{color:var(--lb-secondary);font-size:.9em}\n#panel .panelGrid{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*2.2);text-align:left}\n#panel .panelGrid > div{min-width:0;border:1px solid var(--lb-line);padding:calc(var(--u)*2.5);background:#fff1}\n#panel .panelGrid button{width:100%;margin-top:calc(var(--u)*2)}\n#panel #joinCode{letter-spacing:.25em}\n#panel .error{color:#ff8d81;min-height:1.5em;line-height:1.6}\n#panel .small{font-size:.85em;color:var(--lb-soft)}\n#panel .meta{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*2);flex-wrap:wrap}\n#panel .code{border:1px dashed var(--lb-secondary);color:var(--lb-accent);font-size:1.5em;padding:calc(var(--u)*2.5);letter-spacing:.12em}\n#panel .seatGrid{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*1.5);text-align:left;margin:calc(var(--u)*1) 0}\n#panel .seat{border:1px solid var(--lb-line);background:#ffffff0b;padding:calc(var(--u)*1.8);min-width:0}\n#panel .seat.me{border-color:var(--lb-accent)}\n#panel .seat.offline{opacity:.5}\n#panel .seatcontents{display:flex;flex-direction:column;gap:calc(var(--u)*.8);overflow-wrap:break-word}\n#panel .seatcontents .name{color:var(--lb-accent)}\n#panel .seatcontents .small{color:var(--lb-soft)}\n#panel .seatcontents .life{color:var(--lb-secondary)}\n#panel .actions{display:flex;gap:calc(var(--u)*1.6);justify-content:center;flex-wrap:wrap}\n#panel .actions button{flex:1}\n#panel .note{font-size:.8em;line-height:1.5;color:var(--lb-soft)}\n#panel #intro,#panel #room{display:flex;flex-direction:column;gap:calc(var(--u)*2.5)}\n#panel #room[hidden],#panel #intro[hidden]{display:none}\n#panel #roomTitle{font-size:1.4em;color:var(--lb-accent)}\n#panel #roomCode{font-size:1.7em}\n#panel .waitingLine{font-size:.9em;color:var(--lb-secondary)}\n#panel .statLine{display:flex;justify-content:space-between;gap:4px;color:var(--lb-soft)}\n#panel .statLine b{color:#f7f7f7}\n#panel #glassTitle{display:block;color:var(--lb-accent);margin:calc(var(--u)*1.5) 0}\n#panel #finishText{color:var(--lb-secondary);font-size:.9em}\n#panel #introError{font-size:.9em}\n#toast{z-index:7}\nbody.vapor #hud a{background:#2a0b45;color:#9ff3ff;border-color:#ff71ce}\n@media(max-height:540px){#panel{top:8%!important;max-height:86%!important}}\n</style>\n</head>\n<body class=\"vintage\">\n\n<div id=\"wrap\">\n <canvas id=\"c\"></canvas><canvas id=\"g\"></canvas>\n <div id=\"hud\">\n  <span id=\"lvl\">1P ◫</span><span id=\"balls\">●0</span><span id=\"left\">0%</span><span id=\"lives\">♥3</span><span id=\"tmr\">1:30</span>\n  <span class=\"sp\"></span><button id=\"sty\" type=\"button\" title=\"Visual style\">crt</button><button id=\"sound\" type=\"button\" title=\"Toggle sounds\" aria-pressed=\"true\">♪</button><a href=\"/\" title=\"Solo game\">1P</a>\n </div>\n <div id=\"panel\">\n  <section id=\"intro\">\n   <div id=\"ptitle\">BRICKS ASMR</div>\n   <h1>SHARED BOARD</h1>\n   <p>The Solo game, shared with friends. One board, one paddle per player.</p>\n   <label for=\"playerName\" class=\"label\">YOUR NAME</label>\n   <input id=\"playerName\" maxlength=\"18\" autocomplete=\"nickname\" placeholder=\"Player name\">\n   <div class=\"panelGrid\">\n    <div><h2>HOST A ROOM</h2><p>Invite up to 3 friends.</p><button id=\"create\" class=\"primary\" type=\"button\">CREATE</button></div>\n    <div><h2>JOIN A ROOM</h2><input id=\"joinCode\" maxlength=\"6\" placeholder=\"6-LETTER CODE\" autocomplete=\"off\" spellcheck=\"false\"><button id=\"join\" type=\"button\">JOIN</button></div>\n   </div>\n   <div id=\"introError\" class=\"error\" role=\"alert\" aria-live=\"polite\"></div>\n   <p class=\"note\">Move only your paddle · one board · 2–4 players</p>\n  </section>\n  <section id=\"room\" hidden>\n   <div id=\"statusText\" class=\"waitingLine\">PAIRING LOBBY</div>\n   <h1 id=\"roomTitle\">Gather your players.</h1>\n   <div class=\"meta\"><span id=\"roomCode\" class=\"code\">------</span><button id=\"copy\" type=\"button\">COPY LINK</button></div>\n   <div class=\"statLine\"><span id=\"playerCount\">1/4</span><span>CONNECTED: <b id=\"connection\">CONNECTING…</b></span></div>\n   <div class=\"seatGrid\"><div id=\"slot0\" class=\"seat\"></div><div id=\"slot2\" class=\"seat\"></div><div id=\"slot1\" class=\"seat\"></div><div id=\"slot3\" class=\"seat\"></div></div>\n   <div id=\"glass\"><strong id=\"glassTitle\">Waiting for friends</strong><p id=\"glassText\">Share the code to fill the other sides.</p></div>\n   <div id=\"finishText\" aria-live=\"polite\"></div>\n   <div class=\"actions\"><button id=\"start\" class=\"primary\" type=\"button\" hidden>START ROUND</button><button id=\"leave\" type=\"button\">LEAVE</button></div>\n   <div class=\"note\">ROUND <span id=\"round\">—</span> · <span id=\"timer\">1:30</span></div>\n  </section>\n </div>\n <div id=\"toast\" role=\"status\" aria-live=\"polite\"></div>\n</div>\n<div id=\"crt\"></div>\n<script>\n(function(){\n\"use strict\";\nconst $=id=>document.getElementById(id);\nconst API=location.pathname.startsWith(\"/multiplayer\")?\"/api/multiplayer/rooms\":\"/api/rooms\";\nlet roomCode=\"\",you=\"\",state=null,socket=null,closed=false,retry=null,frame=0,lastStateAt=0,lastHits=-1,localPos=.5,inputSeq=0;\n// ---------- canvas ----------\nconst wrap = document.getElementById('wrap'), cv = document.getElementById('c'), ctx = cv.getContext('2d');\nlet scale = 1;\nconst gcv = document.getElementById('g');\nconst STYLES = ['clean', 'vintage', 'vapor'], STY_LABEL = {clean: 'clean', vintage: 'crt', vapor: 'vapor'};\nlet style = 'vintage';\ntry { const v = new URLSearchParams(location.search).get('style') || localStorage.getItem('brick-asmr-style'); if (STYLES.includes(v)) style = v; } catch(e) {}\nconst FX = {clean: {k: 0, ch: 0, vg: 0, br: 1}, vintage: {k: 0.07, ch: 0.0018, vg: 0.45, br: 1.3}, vapor: {k: 0.035, ch: 0.0015, vg: 0.3, br: 1.05}};\nlet gl = null, glTex, glU = {};\ntry {\n  gl = gcv.getContext('webgl', {antialias: false, alpha: false});\n  const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };\n  const pr = gl.createProgram();\n  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));\n  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `precision mediump float;uniform sampler2D t;uniform float k,ch,vg,br,tm;varying vec2 v;\nvoid main(){vec2 c=v*2.-1.;c*=1.+k*c.yx*c.yx;vec2 uv=c*.5+.5;\nif(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}\nvec3 col=vec3(texture2D(t,uv+vec2(ch,0.)).r,texture2D(t,uv).g,texture2D(t,uv-vec2(ch,0.)).b);\nvec2 e=smoothstep(vec2(0.),vec2(.015),uv)*smoothstep(vec2(0.),vec2(.015),1.-uv);\ncol*=e.x*e.y*br*(1.-vg*dot(c,c)*.5)*(.975+.025*sin(tm*47.));\ngl_FragColor=vec4(col,1.);}`));\n  gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw 'link';\n  gl.useProgram(pr);\n  const bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf);\n  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);\n  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);\n  glTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, glTex);\n  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);\n  for (const [a, b] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, a, b);\n  for (const n of ['k', 'ch', 'vg', 'br', 'tm']) glU[n] = gl.getUniformLocation(pr, n);\n} catch(e) { gl = null; }\nconst useGL = () => gl && style !== 'clean';\nfunction applyStyle(){\n  document.body.className = style;\n  document.getElementById('sty').textContent = STY_LABEL[style];\n  cv.style.visibility = useGL() ? 'hidden' : 'visible';\n  gcv.style.visibility = useGL() ? 'visible' : 'hidden';\n  \n}\nfunction postFX(now){\n  if (!useGL()) return;\n  const f = FX[style];\n  gl.viewport(0, 0, gcv.width, gcv.height);\n  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);\n  gl.uniform1f(glU.k, f.k); gl.uniform1f(glU.ch, f.ch); gl.uniform1f(glU.vg, f.vg); gl.uniform1f(glU.br, f.br); gl.uniform1f(glU.tm, now / 1000);\n  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);\n}\nfunction fit(){\n  const vv = window.visualViewport, vw = Math.floor(vv ? vv.width : window.innerWidth), vh = Math.floor(vv ? vv.height : window.innerHeight);\n  const h = Math.floor(Math.min(vh, vw * 16 / 9)), w = Math.floor(h * 9 / 16);\n  wrap.style.width = w + 'px'; wrap.style.height = h + 'px'; wrap.style.setProperty('--u', (w / 100) + 'px');\n}\nfunction resize(){\n  fit();\n  const r = wrap.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);\n  scale = r.width / W * dpr;\n  cv.width = gcv.width = Math.round(W * scale); cv.height = gcv.height = Math.round(H * scale);\n  \n}\nwindow.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));\nif (window.visualViewport) window.visualViewport.addEventListener('resize', resize);\n\n\nconst W=360,H=640,SX0=40,SX1=320,SY=614;\nconst colors=[\"#d57d70\",\"#8dbbca\",\"#d0a768\",\"#a5ae91\"];\nlet sparks=[],rings=[],flash=0,shake=0,lastHP=null,drawnHP=null,drawnStyle=null;\nlet soundOn=true, audio=null;\nconst melody=[0,3,5,7,10,12,15,19];\nfunction clearFx(){sparks=[];rings=[];flash=0;shake=0;}\nfunction sparkle(b){\n const c=colors[b.c%4];const x=b.x+3,y=b.y+3;\n rings.push({x,y,r:2,t:1,c});\n for(let i=0;i<9;i++){const a=Math.random()*Math.PI*2,v=35+Math.random()*105;sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t:.6+Math.random()*.5,c});}\n flash=Math.max(flash,.12);shake=Math.max(shake,2);\n}\nfunction audioInit(){\n if(!soundOn)return;\n if(audio){if(audio.state===\"suspended\")audio.resume();return;}\n try{audio=new(window.AudioContext||window.webkitAudioContext)();}catch{}\n}\nfunction blip(note,volume=.1,duration=.12){\n if(!soundOn||!audio)return;\n const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();\n o.type=style===\"vapor\"?\"sine\":\"triangle\";o.frequency.value=note;\n g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);\n o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+duration+.02);\n}\n\nfunction error(message){$(\"introError\").textContent=message||\"\";}\nasync function request(path,body){\n const options={credentials:\"same-origin\",cache:\"no-store\"};\n if(body!==undefined){options.method=\"POST\";options.headers={\"content-type\":\"application/json\"};options.body=JSON.stringify(body);}\n const response=await fetch(API+path,options);\n let data={};try{data=await response.json();}catch{}\n if(!response.ok)throw Error(data.error||\"The room could not be reached\");\n return data;\n}\nfunction name(){const n=$(\"playerName\").value.trim();localStorage.setItem(\"bricksPlayerName\",n);return n;}\nfunction waiting(b){$(\"create\").disabled=$(\"join\").disabled=b;}\nasync function doCreate(){\n waiting(true);error(\"\");\n try{const result=await request(\"\",{name:name()});await enter(result.code,result.you);}\n catch(e){error(e.message);}finally{waiting(false);}\n}\nasync function doJoin(){\n waiting(true);error(\"\");\n try{const code=$(\"joinCode\").value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw Error(\"Enter a valid six-character code\");const result=await request(\"/\"+code+\"/join\",{name:name()});await enter(result.code,result.you);}\n catch(e){error(e.message);}finally{waiting(false);}\n}\nfunction beep(){\n const n=Math.max(0,state?.hits||0);\n blip(196*Math.pow(2,melody[n%melody.length]/12),.075,.11);\n}\nasync function enter(code,id){\n closed=false;roomCode=code;you=id||\"\";clearFx();lastHP=null;localStorage.setItem(\"bricksLastRoom\",code);\n $(\"intro\").hidden=true;$(\"room\").hidden=false;$(\"roomCode\").textContent=code;\n const result=await request(\"/\"+code+\"/state\");\n you=result.you;accept(result.state);connect();\n if(!frame)frame=requestAnimationFrame(draw);\n}\nfunction connect(){\n if(closed||!roomCode)return;\n const protocol=location.protocol===\"https:\"?\"wss:\":\"ws:\";\n const ws=new WebSocket(protocol+\"//\"+location.host+API+\"/\"+roomCode+\"/socket\");\n socket=ws;inputSeq=0;$(\"connection\").textContent=\"Connecting…\";\n ws.onopen=()=>{$(\"connection\").textContent=\"Live\";};\n ws.onmessage=event=>{let message;try{message=JSON.parse(event.data);}catch{return;}\n  if(message.you)you=message.you;if(message.state)accept(message.state);\n };\n ws.onclose=()=>{if(closed||socket!==ws)return;$(\"connection\").textContent=\"Reconnecting…\";retry=setTimeout(connect,1500);};\n ws.onerror=()=>{try{ws.close();}catch{}};\n}\nfunction accept(s){\n if(!s)return;\n const prior=lastHP,oldHits=lastHits;\n state=s;lastStateAt=performance.now();lastHits=s.hits;\n const next=s.board?.hp||null;\n if(prior&&next&&next!==prior){\n  for(let i=0;i<Math.min(prior.length,next.length);i++)if(prior[i]!==\"0\"&&next[i]===\"0\"){\n   sparkle({x:GRID_X+(i%GRID_COLS)*GRID_SIZE,y:GRID_Y+Math.floor(i/GRID_COLS)*GRID_SIZE,c:parseInt(s.board.colors[i],16)||0});\n  }\n  if(oldHits>=0&&s.hits>oldHits)beep();\n }\n lastHP=next;render();\n}\nfunction renderSeat(side,p,mine){\n const root=$(\"slot\"+side);root.hidden=!p;if(!p)return;\n root.replaceChildren();root.classList.toggle(\"me\",!!mine);root.classList.toggle(\"offline\",!p.online);\n const wrap=document.createElement(\"div\");wrap.className=\"seatcontents\";\n const label=document.createElement(\"span\");label.className=\"name\";\n label.textContent=({0:\"BOTTOM\",1:\"LEFT\",2:\"TOP\",3:\"RIGHT\"}[side])+\" · \"+p.name+(mine?\" · YOU\":\"\");\n const status=document.createElement(\"span\");status.className=\"small\";status.textContent=p.online?\"● LIVE\":\"○ OFFLINE\";\n wrap.append(label,status);\n if(state.status!==\"waiting\"){const score=document.createElement(\"span\");score.className=\"life\";score.textContent=p.score+\" pts · \"+p.lives+\" ♥\";wrap.append(score);}\n root.append(wrap);\n}\nfunction render(){\n const s=state,me=s?.players.find(p=>p.id===you);if(!me)return;\n const online=s.players.filter(p=>p.online).length,hosting=s.hostId===you;\n $(\"playerCount\").textContent=s.players.length+\" PADDLES · \"+online+\" ONLINE\";\n $(\"round\").textContent=s.round||\"—\";\n const secs=Math.max(0,s.remaining|0);\n $(\"timer\").textContent=Math.floor(secs/60)+\":\"+String(secs%60).padStart(2,\"0\");\n $(\"lvl\").textContent=s.players.length+\"P ◫\";\n $(\"balls\").textContent=\"●\"+(s.balls?.length||0);\n $(\"left\").textContent=s.board?.total?Math.round(100*(1-s.board.remaining/s.board.total))+\"%\":\"0%\";\n $(\"lives\").textContent=\"♥\"+me.lives;$(\"tmr\").textContent=$(\"timer\").textContent;\n $(\"statusText\").textContent=s.status===\"waiting\"?\"SHARED BOARD LOBBY\":s.status===\"playing\"?\"LIVE MATCH\":\"ROUND COMPLETE\";\n $(\"roomTitle\").textContent=s.status===\"waiting\"?\"Invite your players.\":s.status===\"playing\"?\"One board. Play together.\":\"Well played.\";\n $(\"start\").hidden=!(hosting&&(s.status===\"waiting\"||s.status===\"finished\"));\n $(\"start\").textContent=s.status===\"finished\"?\"PLAY AGAIN\":\"START ROUND\";$(\"start\").disabled=online<2;\n $(\"glass\").hidden=s.status===\"playing\";$(\"panel\").hidden=s.status===\"playing\";\n if(s.status===\"waiting\"){$(\"glassTitle\").textContent=\"WAITING FOR PLAYERS\";$(\"glassText\").textContent=\"Share \"+s.code+\" · \"+s.players.length+\" active paddle\"+(s.players.length===1?\"\":\"s\")+\" · start with two online.\";}\n if(s.status===\"finished\"){$(\"glassTitle\").textContent=\"ROUND COMPLETE\";const top=Math.max(...s.players.map(p=>p.score));$(\"glassText\").textContent=s.players.filter(p=>p.score===top).map(p=>p.name).join(\" & \")+\" · \"+top+\" POINTS\";}\n $(\"finishText\").textContent=s.status===\"finished\"?(hosting?\"Ready for another round.\":\"Waiting for the host to restart.\"):\"\";\n for(let side=0;side<4;side++){const p=s.players.find(v=>v.seat===side);renderSeat(side,p,p?.id===you);}\n}\n\nconst GRID_X=6,GRID_Y=40,GRID_SIZE=6,GRID_COLS=58,GRID_ROWS=64;\nconst tiles=document.createElement(\"canvas\");tiles.width=W;tiles.height=H;const tileCtx=tiles.getContext(\"2d\");\nconst PALETTE={\n clean:[\"#7d9cb5\",\"#8eb59e\",\"#c1ab85\",\"#c58e90\",\"#7e938c\",\"#9ca3b0\",\"#b5a088\",\"#9b8da9\",\"#a2bdb3\",\"#94aec2\",\"#b0acaa\",\"#bfaaa0\",\"#abb59a\",\"#9da9ad\",\"#b8b4a1\",\"#c1b6b2\"],\n vintage:[\"#d57d70\",\"#8dbbca\",\"#d0a768\",\"#a5ae91\",\"#ac94c7\",\"#b9c28f\",\"#d6a48b\",\"#8caabd\",\"#c79baa\",\"#b4a27a\",\"#86b3a0\",\"#d0b3a0\",\"#c2a2c4\",\"#88bac4\",\"#d0a36e\",\"#a8ae91\"],\n vapor:[\"#ff71ce\",\"#01cdfe\",\"#05ffa1\",\"#b967ff\",\"#ff9dea\",\"#7ee9fd\",\"#f6a6e6\",\"#c187ff\",\"#ff78d2\",\"#59ffde\",\"#9ec1ff\",\"#f5a5ff\",\"#bfe6ff\",\"#fa89c6\",\"#b9f9ab\",\"#a786fc\"]\n};\nfunction paintTiles(board){\n if(!board?.hp||board.hp===drawnHP&&style===drawnStyle)return;\n drawnHP=board.hp;drawnStyle=style;tileCtx.clearRect(0,0,W,H);\n for(let i=0;i<Math.min(board.hp.length,GRID_COLS*GRID_ROWS);i++){\n  const life=board.hp.charCodeAt(i)-48;if(life<1)continue;\n  const x=GRID_X+i%GRID_COLS*GRID_SIZE,y=GRID_Y+Math.floor(i/GRID_COLS)*GRID_SIZE;\n  tileCtx.fillStyle=life>1&&board.colors[i]===\"0\"?(style===\"vapor\"?board.vaporWalls?.[Math.min(3,life)]:board.wallColors?.[Math.min(3,life)])||(style===\"vapor\"?\"#80519f\":\"#96969e\"):(style===\"vapor\"?board.vaporPalette:board.palette)?.[(parseInt(board.colors[i],16)||0)%16]||PALETTE[style][(parseInt(board.colors[i],16)||0)%16];\n  tileCtx.fillRect(x+.5,y+.5,GRID_SIZE-1,GRID_SIZE-1);\n  tileCtx.fillStyle=\"#0003\";tileCtx.fillRect(x+1.5,y+1.5,GRID_SIZE-3,GRID_SIZE-3);\n }\n}\nfunction draw(now){\n frame=requestAnimationFrame(draw);\n ctx.setTransform(scale,0,0,scale,0,0);\n const s=state,me=s?.players.find(p=>p.id===you),V=style===\"vapor\",C=style===\"clean\";\n ctx.fillStyle=V?\"#0d0221\":C?\"#1b1b1b\":\"#151715\";ctx.fillRect(0,0,W,H);\n const qx=(Math.random()-.5)*shake,qy=(Math.random()-.5)*shake;shake*=.87;\n ctx.save();ctx.translate(qx,qy);\n ctx.fillStyle=V?\"#140430\":\"#232323\";ctx.fillRect(6,40,348,504);\n ctx.strokeStyle=V?\"#ff71ce\":\"#4b4b4b\";ctx.lineWidth=1;ctx.strokeRect(6.5,40.5,347,503);\n paintTiles(s?.board);ctx.drawImage(tiles,0,0);\n if(s?.players)for(const p of s.players){\n  const own=p.id===you,active=p.online&&p.lives>0;\n  const color=own?(V?\"#ff71ce\":\"#e07a66\"):V?[\"#01cdfe\",\"#05ffa1\",\"#ff71ce\",\"#b967ff\"][p.seat]:\"#8dbbca\";\n  ctx.save();ctx.fillStyle=active?color:(V?\"#483052\":\"#414546\");\n  if(!C&&active){ctx.shadowColor=color;ctx.shadowBlur=11;}\n  const center=p.seat===0||p.seat===2?42+p.pos*276:84+p.pos*416;\n  if(p.seat===0)ctx.fillRect(center-36,531,72,8);\n  if(p.seat===2)ctx.fillRect(center-36,32,72,8);\n  if(p.seat===1)ctx.fillRect(8,center-36,8,72);\n  if(p.seat===3)ctx.fillRect(344,center-36,8,72);\n  ctx.restore();\n }\n if(s?.balls)for(const b of s.balls){\n  const dt=s.status===\"playing\"?Math.min((performance.now()-lastStateAt)/1000,.05):0,x=b.x+b.vx*dt,y=b.y+b.vy*dt;\n  if(s.status===\"playing\"){\n   ctx.strokeStyle=V?\"#01cdfe88\":\"#fff4\";ctx.lineWidth=2.5;\n   ctx.beginPath();ctx.moveTo(x-b.vx*.035,y-b.vy*.035);ctx.lineTo(x,y);ctx.stroke();\n  }\n  if(!C){ctx.fillStyle=V?\"#ff71ce44\":\"#ffa6943f\";ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();}\n  ctx.fillStyle=V?\"#eaffff\":\"#fff\";ctx.beginPath();ctx.arc(x,y,2.8,0,Math.PI*2);ctx.fill();\n }\n const dt=1/60;\n for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.t-=dt*1.25;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt;if(p.t<=0){sparks.splice(i,1);continue;}ctx.globalAlpha=Math.min(1,p.t);ctx.fillStyle=V?\"#01cdfe\":p.c;ctx.fillRect(p.x,p.y,3,3);}\n ctx.globalAlpha=1;\n for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.t-=dt*1.2;if(r.t<=0){rings.splice(i,1);continue;}ctx.strokeStyle=V?\"#ff71ce\":r.c;ctx.globalAlpha=r.t;ctx.lineWidth=1;ctx.beginPath();ctx.arc(r.x,r.y,20*(1-r.t)+1,0,Math.PI*2);ctx.stroke();}\n ctx.globalAlpha=1;\n if(s&&me){\n  ctx.fillStyle=V?\"#01cdfe\":\"#b0b6b5\";ctx.font=C?\"bold 9px ui-monospace,monospace\":\"7px 'Press Start 2P',monospace\";\n  ctx.textAlign=\"center\";ctx.textBaseline=\"middle\";\n  for(const p of s.players){const name=(p.id===you?\"YOU\":p.name.toUpperCase()).slice(0,16);\n   if(p.seat===0)ctx.fillText(name,180,555);\n   if(p.seat===2)ctx.fillText(name,180,24);\n   if(p.seat===1){ctx.save();ctx.translate(4,290);ctx.rotate(-Math.PI/2);ctx.fillText(name,0,0);ctx.restore();}\n   if(p.seat===3){ctx.save();ctx.translate(356,290);ctx.rotate(Math.PI/2);ctx.fillText(name,0,0);ctx.restore();}\n  }\n }\n ctx.restore();\n const handle=SX0+(me?.pos??localPos)*(SX1-SX0);\n ctx.fillStyle=\"#262626\";ctx.beginPath();ctx.roundRect(SX0-14,SY-14,SX1-SX0+28,28,14);ctx.fill();\n ctx.fillStyle=\"#3a3a3a\";ctx.fillRect(SX0,SY-1.5,SX1-SX0,3);\n ctx.fillStyle=V?\"#ff71ce\":\"#c96a5a\";ctx.beginPath();ctx.roundRect(handle-24,SY-11,48,22,11);ctx.fill();\n ctx.fillStyle=\"#0003\";for(const o of [-6,0,6])ctx.fillRect(handle+o-.75,SY-5,1.5,10);\n ctx.font=C?\"10px ui-monospace,monospace\":\"6px 'Press Start 2P',monospace\";ctx.textBaseline=\"middle\";ctx.textAlign=\"center\";ctx.fillStyle=V?\"#9ff3ff\":\"#888\";\n ctx.fillText(me?.seat===1||me?.seat===3?\"SLIDE TO MOVE · W / S\":\"SLIDE TO MOVE · A / D\",W/2,568);\n if(flash>.001){ctx.fillStyle=\"rgba(255,255,255,\"+flash+\")\";ctx.fillRect(6,40,348,504);flash*=.82;}\n postFX(now||performance.now());\n}\nfunction send(pos){\n localPos=Math.max(0,Math.min(1,pos));\n if(socket?.readyState===WebSocket.OPEN&&state?.status===\"playing\")socket.send(JSON.stringify({type:\"paddle-input\",version:1,pos:localPos,seq:++inputSeq}));\n}\nfunction pointer(event){\n const rect=cv.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*W,y=(event.clientY-rect.top)/rect.height*H;\n const side=state?.players.find(p=>p.id===you)?.seat||0;\n send(y>=582?(x-SX0)/(SX1-SX0):(side===1||side===3?(y-84)/416:(x-42)/276));\n}\ncv.addEventListener(\"pointerdown\",event=>{audioInit();cv.setPointerCapture(event.pointerId);pointer(event);});\ncv.addEventListener(\"pointermove\",event=>{if(event.buttons||event.pointerType===\"touch\")pointer(event);});\nwindow.addEventListener(\"keydown\",event=>{\n if(document.activeElement?.matches(\"input\"))return;\n const side=state?.players.find(p=>p.id===you)?.seat||0,key=event.key.toLowerCase();\n let dir=0;\n if(side===0||side===2){if(key===\"arrowleft\"||key===\"a\")dir=-1;if(key===\"arrowright\"||key===\"d\")dir=1;}\n else{if(key===\"arrowup\"||key===\"w\")dir=-1;if(key===\"arrowdown\"||key===\"s\")dir=1;}\n if(dir){event.preventDefault();send(localPos+dir*.045);}\n});\n$(\"create\").addEventListener(\"click\",()=>{audioInit();doCreate();});$(\"join\").addEventListener(\"click\",()=>{audioInit();doJoin();});\n$(\"joinCode\").addEventListener(\"keydown\",event=>{if(event.key===\"Enter\")doJoin();});\n$(\"start\").addEventListener(\"click\",async()=>{try{await request(\"/\"+roomCode+\"/action\",{action:\"start\"});}catch(e){$(\"finishText\").textContent=e.message;}});\n$(\"copy\").addEventListener(\"click\",async()=>{\n const url=location.origin+\"/multiplayer?room=\"+roomCode;\n try{await navigator.clipboard.writeText(url);$(\"copy\").textContent=\"Copied\";setTimeout(()=>$(\"copy\").textContent=\"Copy invite\",1800);}\n catch{window.prompt(\"Copy this invite:\",url);}\n});\n$(\"sound\").addEventListener(\"click\",()=>{soundOn=!soundOn;$(\"sound\").textContent=soundOn?\"♪\":\"×\";$(\"sound\").setAttribute(\"aria-pressed\",String(soundOn));if(soundOn){audioInit();beep();}});\n$(\"leave\").addEventListener(\"click\",async()=>{\n closed=true;clearTimeout(retry);$(\"panel\").hidden=false;try{await request(\"/\"+roomCode+\"/leave\",{});}catch{}\n socket?.close();roomCode=\"\";you=\"\";state=null;lastHits=-1;lastHP=null;drawnHP=null;clearFx();localStorage.removeItem(\"bricksLastRoom\");$(\"room\").hidden=true;$(\"intro\").hidden=false;\n});\n$(\"sty\").addEventListener(\"click\",()=>{style=STYLES[(STYLES.indexOf(style)+1)%STYLES.length];try{localStorage.setItem(\"brick-asmr-style\",style);}catch{}applyStyle();});\napplyStyle();resize();\n$(\"playerName\").value=localStorage.getItem(\"bricksPlayerName\")||\"\";\nconst code=new URL(location.href).searchParams.get(\"room\");\nif(code&&/^[A-Z2-9]{6}$/.test(code.toUpperCase()))$(\"joinCode\").value=code.toUpperCase();\nconst last=localStorage.getItem(\"bricksLastRoom\");\nif(last&&/^[A-Z2-9]{6}$/.test(last))enter(last).catch(()=>{closed=true;roomCode=\"\";$(\"room\").hidden=true;$(\"intro\").hidden=false;$(\"panel\").hidden=false;localStorage.removeItem(\"bricksLastRoom\");});\n})();\n</script></body></html>";
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==="/"||path==="/multiplayer"||path==="/multiplayer/")return htmlResponse(MULTIPLAYER_HTML);
 if(!path.startsWith("/api/rooms/")&&path!=="/api/rooms")return reply({error:"Not found"},404);
 if((request.method==="POST"||request.headers.get("upgrade"))&&!sameOrigin(request))return reply({error:"Invalid origin"},403);
 if(request.method==="POST"&&Number(request.headers.get("content-length")||0)>1024)return reply({error:"Request too large"},413);
 if(path==="/api/rooms"&&request.method==="POST"){
  const body=await request.json().catch(()=>({})),name=nameOf(body.name);
  if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
  for(let i=0;i<6;i++){const id=newCode(),stub=env.ROOMS.get(env.ROOMS.idFromName(id)),response=await stub.fetch(new Request("https://room.internal/api/rooms/"+id+"/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})}));if(response.status===409)continue;return response;}
  return reply({error:"Could not allocate a room"},503);
 }
 const match=/^\/api\/rooms\/([A-Z2-9]{6})\/(join|state|socket|action|leave)$/.exec(path);
 if(!match)return reply({error:"Not found"},404);
 return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
}};