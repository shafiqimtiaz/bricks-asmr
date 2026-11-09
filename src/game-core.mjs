const GRID_COLS=58,GRID_ROWS=64,GRID_SIZE=6,GRID_Y=40,GRID_X=6;
function hash(value){let h=1779033703^value.length;for(let i=0;i<value.length;i++){h=Math.imul(h^value.charCodeAt(i),3432918353);h=h<<13|h>>>19;}h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^h>>>16)>>>0;}
function random(seed){let a=seed;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function bricks(seed,level,playerCount=2){
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

  if(playerCount>1){
   const sideInset=playerCount>=4?13:playerCount===3?11:7;
   const topRow=playerCount>=4?28:playerCount===3?26:24;
   const bottomRow=playerCount>=4?54:playerCount===3?56:58;
   for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(c<sideInset||c>=COLS-sideInset||r<topRow||r>bottomRow||c%4>=2||r%4>=2){
     hollow[r*COLS+c]=1;isWall[r*COLS+c]=0;
    }
   }
  }
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
 return {
  hp:Array.from(hp,x=>String(x)).join(""),
  colors:Array.from(col,x=>x.toString(16)).join(""),
  powerups:Array.from(pu,x=>x.toString(16)).join(""),
  palette,wallColors:wallCols,vaporPalette:vPal,vaporWalls:vWall,
  rootSemi,scale:scale_,wave,decay,archetype,quad,
  total,remaining
 };
}

function bounceBall(ball,side,offset,speed=330){
 const angle=Math.max(-1,Math.min(1,offset))*1.05;
 const parallel=Math.sin(angle)*speed,inward=Math.cos(angle)*speed;
 if(side===0){ball.vx=parallel;ball.vy=-inward;}
 else if(side===2){ball.vx=-parallel;ball.vy=inward;}
 else if(side===1){ball.vx=inward;ball.vy=parallel;}
 else {ball.vx=-inward;ball.vy=-parallel;}
 return ball;
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
function drawBrickTile(context,x,y,size,life,color,palette,walls){
 context.clearRect(x,y,size,size);
 if(life<=0)return;
 context.fillStyle=(color?palette?.[color]:walls?.[life])||"#92989e";
 context.fillRect(x+.5,y+.5,size-1,size-1);
 context.fillStyle="rgba(0,0,0,.18)";
 context.fillRect(x+1.5,y+1.5,size-3,size-3);
}
function soloBrickNote(row,scale,root,wave,decay,combo=0){
 const step=((64-1-row)/(scale.length>5?4:5))|0;
 const semi=root+scale[step%scale.length]+12*((step/scale.length)|0)+Math.min(19,combo/12);
 return {frequency:196*Math.pow(2,semi/12),volume:wave==="square"?.08:.22,duration:decay,wave};
}

export {hash,random,bricks,bounceBall,normalizeBallVelocity,drawBrickTile,soloBrickNote};
export const browserCoreSource=[bounceBall,normalizeBallVelocity,drawBrickTile,soloBrickNote].map(fn=>fn.toString()).join("\n");
export const soloCoreSource="const GRID_COLS=58,GRID_ROWS=64,GRID_SIZE=6,GRID_Y=40,GRID_X=6;\n"+[hash,random,bricks,bounceBall,normalizeBallVelocity,drawBrickTile,soloBrickNote].map(fn=>fn.toString()).join("\n");
