import { createBrickMusic } from "./brick-music.js";
import { buildLevelV2 } from "./level-v2.js";
import { buildLevelV3 } from "./level-v3.js";
import { buildLevelV4 } from "./level-v4.js";
function hash(value){let h=1779033703^value.length;for(let i=0;i<value.length;i++){h=Math.imul(h^value.charCodeAt(i),3432918353);h=h<<13|h>>>19;}h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^h>>>16)>>>0;}
function random(seed){let a=seed;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function arenaLayout(aspect=9/16){
 const ratio=Number.isFinite(aspect)?Math.max(0.4,Math.min(32/9,aspect)):9/16;
 const width=Math.round(640*ratio),height=640;
 const cell=Math.max(6,Math.round(6*Math.pow(width/360,.65)));
 const cols=Math.max(16,2*Math.floor((width-12)/cell/2));
 const rows=Math.max(18,2*Math.floor(Math.min(64,384/cell)/2));
 return {width,height,cell,cols,rows,gridX:(width-cols*cell)/2,gridY:40};
}
// Rooms of three or four play on a square court: the paddle lines are 488 apart both ways, so every seat's view is the same.
function squareArena(){return {width:516,height:640,cell:8,cols:62,rows:62,gridX:10,gridY:44,square:true};}
function bricks(seed,playerCount=2,arena=arenaLayout(),version=1){
 const GRID_COLS=arena.cols,GRID_ROWS=arena.rows,GRID_SIZE=arena.cell,GRID_Y=arena.gridY,GRID_X=arena.gridX;
 // Multiplayer runs Solo's board generator on a smaller field that leaves a lane in front of every paddle.
 const crowd=playerCount>=4?[13,28,54]:playerCount===3?[11,26,56]:playerCount===2?[7,24,58]:[0,0,63];
  // On the square court the formation is a centred square with the same 110-pixel lane in front of every edge.
 const FIELD_C=arena.square?Math.round((124-GRID_X)/GRID_SIZE):Math.round(GRID_COLS*crowd[0]/58),FIELD_R=arena.square?Math.round((158-GRID_Y)/GRID_SIZE):Math.round(GRID_ROWS*crowd[1]/64);
 const COLS=GRID_COLS-2*FIELD_C,ROWS=arena.square?GRID_ROWS-2*FIELD_R:Math.round(GRID_ROWS*(crowd[2]+1)/64)-FIELD_R,N=COLS*ROWS,originalPortrait=COLS===58&&ROWS===64;
 const SCALES=[[0,2,4,7,9],[0,3,5,7,10],[0,2,3,7,8],[0,2,4,6,7,9,11],[0,2,3,5,7,9,10],[0,4,5,7,11]];
 const PU_W=[14,12,10,9,8,8,8,7,6,6],PU_WSUM=PU_W.reduce((a,b)=>a+b,0);
 const pickPU=u=>{let x=u*PU_WSUM;for(let j=0;j<PU_W.length;j++){x-=PU_W[j];if(x<0)return j+1;}return 10;};
 const mulberry=random;
 let hp,col,pu,palette,wallCols,vPal,vWall,rootSemi,scale_,wave,decay,archetype,quad,remaining,total;
function genLevel(){
  const rng = mulberry(hash(seed + ':1'));
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
  { const vr = mulberry(hash(seed + ':1:vapor')), VH = [322, 292, 188, 265, 176, 338, 205], o = Math.floor(vr() * 7);
    vPal = []; for (let k = 0; k < 16; k++) vPal.push(`hsl(${VH[(k + o) % 7]},${68 + vr() * 18}%,${54 + vr() * 12}%)`);
    vWall = ['', '#4a2f78', '#6a46a3', '#8f6bd0']; }
  rootSemi = RI(0, 11) - 5;
  scale_ = SCALES[(1 + RI(0, SCALES.length - 1)) % SCALES.length];
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
  // the seed picks the layout family
  const ARCH = 8;
  archetype = (hash(seed) + 3) % ARCH;
  const setCell = (c, r, reg, wall, hol) => { const i = r * COLS + c; region[i] = reg; isWall[i] = wall; hollow[i] = hol; };
  if (archetype === 0) { // scattered nested shapes
    const nTop = RI(1, 4);
    for (let k = 0; k < nTop; k++) { const w = originalPortrait ? R(6, 22) : R(4, Math.min(22, COLS / 3)), h = originalPortrait ? R(6, 22) : R(4, Math.min(22, ROWS / 3)); place({t: RI(0, 3), cx: R(w + 1, COLS - w - 1), cy: R(h + 1, ROWS - h - 1), w, h}, 0); }
  } else if (archetype === 1) { // concentric rings
    const t = RI(0, 3), cx = COLS / 2 + R(-6, 6), cy = ROWS / 2 + (originalPortrait ? R(-6, 6) : R(-3, 3)), w = originalPortrait ? R(20, 30) : R(COLS * .32, COLS * .47), h = originalPortrait ? R(22, 34) : R(ROWS * .33, ROWS * .48), k = RI(3, 7);
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
    const wide = rng() < 0.35 ? 2 : 1, len = Math.round(RI(40, 160) * (playerCount > 1 ? Math.min(1, N / 3712) : 1));
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
  // symmetry: always left-right; some boards four-way (bottom half mirrored to top)
  quad = rng() < 0.35;
  const copy = (a, b) => { region[b] = region[a]; isWall[b] = isWall[a]; hollow[b] = hollow[a]; };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS / 2; c++) copy(r * COLS + c, r * COLS + COLS - 1 - c);
  if (quad) for (let r = 0; r < ROWS / 2; r++) for (let c = 0; c < COLS; c++) copy((ROWS - 1 - r) * COLS + c, r * COLS + c);
  // narrow trap gap above the bricks
  const topGap = RI(1, 2);
  for (let i = 0; i < topGap * COLS; i++) { hollow[i] = 1; isWall[i] = 0; }

  // fill
  const density = playerCount>1?R(0.025,0.045):R(0.006,0.014);
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
 if(N!==GRID_COLS*GRID_ROWS){
  const place=cells=>{const out=new Uint8Array(GRID_COLS*GRID_ROWS);for(let r=0;r<ROWS;r++)out.set(cells.subarray(r*COLS,(r+1)*COLS),(r+FIELD_R)*GRID_COLS+FIELD_C);return out;};
  hp=place(hp);col=place(col);pu=place(pu);
 }
 let minC=GRID_COLS,minR=GRID_ROWS,maxC=-1,maxR=-1;
 for(let i=0;i<hp.length;i++)if(hp[i]){
  const c=i%GRID_COLS,r=(i/GRID_COLS)|0;
  minC=Math.min(minC,c);maxC=Math.max(maxC,c);
  minR=Math.min(minR,r);maxR=Math.max(maxR,r);
 }
 const legacy={
  hp:Array.from(hp,x=>String(x)).join(""),
  colors:Array.from(col,x=>x.toString(16)).join(""),
  powerups:Array.from(pu,x=>x.toString(16)).join(""),
  palette,wallColors:wallCols,vaporPalette:vPal,vaporWalls:vWall,
  rootSemi,scale:scale_,wave,decay,archetype,quad,
  centerX:GRID_X+(minC+maxC+1)*GRID_SIZE/2,
  centerY:GRID_Y+(minR+maxR+1)*GRID_SIZE/2,
  total,remaining,arena
 };
 return version===4?buildLevelV4(legacy,seed,playerCount,arena,hash,random):version===3?buildLevelV3(legacy,seed,playerCount,arena,hash,random):version===2?buildLevelV2(legacy,seed,playerCount,arena,hash,random):legacy;
}

// One ball speed for Solo and Multiplayer; wider arenas are a little faster so crossing them takes similar time.
function ballSpeed(arena){return Math.round(300*Math.pow(arena.width/360,.35));}
// A serve aimed `angle` radians off straight-in, measured on the server's own screen (positive = their right).
function aimVelocity(seat,angle,speed){
 const sx=Math.sin(angle)*speed,sy=-Math.cos(angle)*speed;
 const [a,b,c,d]=seat===2?[-1,0,0,-1]:seat===1?[0,-1,1,0]:seat===3?[0,1,-1,0]:[1,0,0,1];
 return {vx:a*sx+b*sy,vy:c*sx+d*sy};
}
function normalizeBallVelocity(ball,speed=330,axis="y"){
 const length=Math.hypot(ball.vx,ball.vy)||1;
 ball.vx*=speed/length;ball.vy*=speed/length;
 const direction=axis==="x"?"vx":"vy",other=axis==="x"?"vy":"vx";
 if(Math.abs(ball[direction])<speed*.22){
  ball[direction]=(ball[direction]<0?-1:1)*speed*.22;
  ball[other]=Math.sign(ball[other]||1)*speed*Math.sqrt(1-.22*.22);
 }
 return ball;
}
function drawBrickTile(context,x,y,size,life,color,palette,walls,powerup=0){
 context.clearRect(x,y,size,size);
 if(life<=0)return;
 context.fillStyle=(color?palette?.[color]:walls?.[life])||"#92989e";
 context.fillRect(x+.5,y+.5,size-1,size-1);
 context.fillStyle="rgba(0,0,0,.18)";
 context.fillRect(x+1.5,y+1.5,size-3,size-3);
 if(life===4){
  context.fillStyle="rgba(220,245,248,.26)";
  context.fillRect(x+1,y+1,size-2,Math.max(.8,size*.14));
 }
 if(powerup===12){
  context.fillStyle="#ffe0aa";
  const d=Math.max(1.3,size*.32);
  context.fillRect(x+(size-d)/2,y+(size-d)/2,d,d);
 }
}
function aimDragAngle(start, pixelDelta, width){return start+pixelDelta/Math.max(1,width)*2.3;}
function drawAimGuide(context,preview,color="#e5f4eb",dragging=false,ball=null){
 const pts=preview?.pts;
 if(!pts||pts.length<4)return;
 const path=[{x:ball?.x??pts[0],y:ball?.y??pts[1],d:0}];
 const maxDistance=260;
 for(let i=ball?0:2;i<pts.length;i+=2){
  const prev=path[path.length-1],x=pts[i],y=pts[i+1];
  const step=Math.hypot(x-prev.x,y-prev.y);
  if(step<.01)continue;
  if(prev.d+step>=maxDistance){
   const t=(maxDistance-prev.d)/step;
   path.push({x:prev.x+(x-prev.x)*t,y:prev.y+(y-prev.y)*t,d:maxDistance});
   break;
  }
  path.push({x,y,d:prev.d+step});
 }
 if(path.length<2||path[path.length-1].d<10)return;
 const length=path[path.length-1].d;
 context.save();
 context.fillStyle=color;
 let j=1;
 for(let distance=12;distance<=length;distance+=12){
  while(j<path.length-1&&path[j].d<distance)j++;
  const a=path[j-1],b=path[j],t=(distance-a.d)/(b.d-a.d||1);
  const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
  context.globalAlpha=(dragging?.95:.78)*Math.pow(1-distance/(maxDistance+32),1.35);
  context.beginPath();
  context.arc(x,y,distance<48?2.4:1.8,0,Math.PI*2);
  context.fill();
 }
 // One subtle accent at the first predicted ricochet, if visible.
 for(let i=0;i+1<(preview.marks?.length||0);i+=2){
  const x=preview.marks[i],y=preview.marks[i+1];
  if(!path.some(p=>(p.x-x)**2+(p.y-y)**2<100))continue;
  context.globalAlpha=.75;
  context.fillStyle="#e8ad91";
  context.beginPath();
  context.arc(x,y,2.8,0,Math.PI*2);
  context.fill();
  break;
 }
 context.restore();
}
function soloBrickNote(row,scale,root,wave,decay,combo=0){
 const step=((64-1-row)/(scale.length>5?4:5))|0;
 const semi=root+scale[step%scale.length]+12*((step/scale.length)|0)+Math.min(19,combo/12);
 return {frequency:196*Math.pow(2,semi/12),volume:wave==="square"?.08:.22,duration:decay,wave};
}

function createASMR(host){
 const Context=host.AudioContext||host.webkitAudioContext;
 const audio=new Context();
 const compressor=audio.createDynamicsCompressor();compressor.threshold.value=-20;compressor.ratio.value=6;
 const master=audio.createGain();master.gain.value=.35;
 const dry=audio.createGain();dry.gain.value=.85;
 master.connect(dry);dry.connect(compressor);compressor.connect(audio.destination);
 // A quiet stereo convolution tail suggests a large, empty corridor without blurring impacts.
 const length=Math.floor(audio.sampleRate*2.4),impulse=audio.createBuffer(2,length,audio.sampleRate);
 let noise=0x47a5b21;
 for(let channel=0;channel<2;channel++){
  const data=impulse.getChannelData(channel);let smoothed=0;
  for(let i=0;i<length;i++){
   noise=(Math.imul(noise,1664525)+1013904223)|0;
   const sample=(noise>>>0)/2147483648-1;
   smoothed=smoothed*.72+sample*.28;
   data[i]=smoothed*Math.pow(1-i/length,2.8);
  }
 }
 const preDelay=audio.createDelay(.1);preDelay.delayTime.value=.028;
 const reverb=audio.createConvolver();reverb.buffer=impulse;
 const lowpass=audio.createBiquadFilter();lowpass.type="lowpass";lowpass.frequency.value=2400;
 const wet=audio.createGain();wet.gain.value=.22;
 master.connect(preDelay);preDelay.connect(reverb);reverb.connect(lowpass);lowpass.connect(wet);wet.connect(compressor);
 return {
  context:audio,
  resume(){if(audio.state==="suspended")audio.resume();},
  blip(freq,vol,dur,type="triangle",delay=0,pan=0){
   const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();
   o.type=type;o.frequency.value=freq;
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.003);
   g.gain.exponentialRampToValueAtTime(.0001,t+dur);
   o.connect(g);
   if(audio.createStereoPanner){
    const stereo=audio.createStereoPanner();
    stereo.pan.value=Math.max(-.5,Math.min(.5,pan));
    g.connect(stereo);stereo.connect(master);
   }else g.connect(master);
   o.start(t);o.stop(t+dur+.02);
  }
 };
}

// Infinite Solo begins with a compact complete pattern above the playing field, not
// a full-height Classic formation already close to the paddle.
function infiniteOpeningBoard(seed,arena,version=4){
 const compactRows=Math.max(18,2*Math.floor(arena.rows*.48/2));
 const source=bricks(seed,1,{...arena,rows:compactRows},version);
 const padding="0".repeat(arena.cols*(arena.rows-compactRows));
 return {...source,hp:source.hp+padding,colors:source.colors+padding,
  powerups:source.powerups+padding,arena,
  centerY:source.centerY};
}

// A client's camera: the same world rotated about the court centre so that the given seat is at the bottom.
function boardView(arena,seat){
 const side=seat===1||seat===3,w=side?504:arena.width-12,h=side?arena.width-12:504;
 return {seat:seat||0,width:w+12,height:h+136,cx:w/2+6,cy:40+h/2,wx:arena.width/2,wy:292};
}
function viewMatrix(view){
 const [a,b,c,d]=view.seat===2?[-1,0,0,-1]:view.seat===1?[0,-1,1,0]:view.seat===3?[0,1,-1,0]:[1,0,0,1];
 return [a,b,c,d,view.cx-a*view.wx-c*view.wy,view.cy-b*view.wx-d*view.wy];
}
function viewPoint(view,x,y){
 const m=viewMatrix(view);
 return {x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]};
}
function sliderPos(view,x){
 const margin=Math.max(40,view.width*.11);
 return Math.max(0,Math.min(1,(x-margin)/(view.width-2*margin)));
}
// Fits a logical stage into the viewport. The top 36 logical pixels are the HUD band; a taller HUD hangs above the stage.
function stageFit(vw,vh,stageW,stageH,panelOpen,hudHeight=0){
 const dock=vw>=900&&vw>=vh*1.15&&panelOpen;
 const edge=Math.min(48,Math.max(8,Math.round(Math.min(vw,vh)*.022)));
 const gap=Math.min(28,Math.max(12,Math.round(vw*.015)));
 const sidebar=dock?Math.min(720,Math.max(320,Math.round(vw*.29))):0;
 const availableWidth=Math.max(1,vw-edge*2-(dock?sidebar+gap:0)),availableHeight=Math.max(1,vh-edge*2);
 let height=Math.min(availableHeight,availableWidth*stageH/stageW);
 if(hudHeight>36*height/stageH)height=Math.max(1,Math.min(height,(availableHeight-hudHeight)/(1-36/stageH)));
 const width=height*stageW/stageH;
 return {dock,edge,gap,sidebar,width,height,hudOver:Math.max(0,hudHeight-36*height/stageH),
  stageLeft:(vw-width-(dock?sidebar+gap:0))/2,unit:Math.min(14,Math.max(3,Math.min(width/100,height/150)))};
}
export {arenaLayout,squareArena,hash,random,bricks,normalizeBallVelocity,drawBrickTile,aimDragAngle,drawAimGuide,soloBrickNote,createASMR,boardView,viewMatrix,viewPoint,sliderPos,stageFit,ballSpeed,aimVelocity};
const browserCorePrelude="const __name=(target)=>target;\n";
export const browserCoreSource=browserCorePrelude+[arenaLayout,normalizeBallVelocity,drawBrickTile,aimDragAngle,drawAimGuide,soloBrickNote,createASMR,createBrickMusic,boardView,viewMatrix,viewPoint,sliderPos,stageFit,ballSpeed,aimVelocity].map(fn=>fn.toString()).join("\n");
export const soloCoreSource=browserCorePrelude+[arenaLayout,hash,random,bricks,infiniteOpeningBoard,buildLevelV2,buildLevelV3,buildLevelV4,normalizeBallVelocity,drawBrickTile,aimDragAngle,drawAimGuide,soloBrickNote,createASMR,createBrickMusic,stageFit,ballSpeed,aimVelocity].map(fn=>fn.toString()).join("\n");
