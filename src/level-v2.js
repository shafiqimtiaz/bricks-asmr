// Versioned procedural layouts. V1 stays unchanged for historical seeds and scores.
export function buildLevelV2(base, seed, playerCount, arena, hashSeed, randomSeed) {
  const cols = arena.cols, rows = arena.rows, size = cols * rows;
  const baseline = base.hp;
  let left = cols, right = -1, top = rows, bottom = -1;
  for (let i = 0; i < baseline.length; i++) if (baseline[i] !== "0") {
    const c = i % cols, r = Math.floor(i / cols);
    left = Math.min(left, c); right = Math.max(right, c);
    top = Math.min(top, r); bottom = Math.max(bottom, r);
  }
  const width = right - left + 1, height = bottom - top + 1;
  if (width < 16 || height < 8) return {...base, generatorVersion: 2, pattern: "fallback"};

  const kinds = ["needle", "prison", "domino", "serpent", "jackpot", "twins"];
  const kind = hashSeed(seed + ":v2:pattern") % kinds.length;
  const sides = playerCount === 1 ? [0, 2] : playerCount === 2 ? [0, 2] :
    playerCount === 3 ? [0, 2, 1] : [0, 2, 1, 3];
  const midX = Math.floor((left + right) / 2), midY = Math.floor((top + bottom) / 2);
  const ix = Math.max(4, Math.floor(width * (kind === 5 ? .15 : .19)));
  const iy = Math.max(2, Math.floor(height * (height < 28 ? .13 : kind === 3 ? .16 : .19)));
  const x0 = left + ix, x1 = right - ix, y0 = top + iy, y1 = bottom - iy;
  const index = (c, r) => r * cols + c;
  const inField = (c, r) => c >= left && c <= right && r >= top && r <= bottom;

  function candidate(attempt) {
    const rng = randomSeed(hashSeed(seed + ":v2:geometry:" + attempt));
    const rewards = randomSeed(hashSeed(seed + ":v2:rewards:" + attempt));
    const rand = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const hp = new Uint8Array(size), color = new Uint8Array(size), powers = new Uint8Array(size);
    const density = kind === 4 ? .65 : kind === 0 ? .57 : .53;
    const twoWay = playerCount > 1;
    for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) {
      const cx = Math.min(c-left, right-c), cy = twoWay ? Math.min(r-top,bottom-r) : r-top;
      const noise = hashSeed(seed + ":v2:fill:" + attempt + ":" + cx + ":" + cy) / 4294967296;
      if (noise < density) hp[index(c,r)] = noise < .035 ? 2 : 1;
      color[index(c,r)] = 2 + ((Math.floor(cx/4) + Math.floor(cy/5)) % 12);
    }
    const set = (c, r, life, group) => {
      if (!inField(c,r)) return;
      const i = index(c,r); hp[i] = life;
      if (group !== undefined) color[i] = group;
      if (!life) {color[i] = 0; powers[i] = 0;}
    };
    const clear = (c,r) => set(c,r,0);
    const freeVertical = (x, lo, hi, w) => {
      for (let r = lo; r <= hi; r++) for (let k = -Math.floor((w-1)/2); k <= Math.ceil((w-1)/2); k++) clear(x+k,r);
    };
    const freeHorizontal = (y, lo, hi, w) => {
      for (let c = lo; c <= hi; c++) for (let k = -Math.floor((w-1)/2); k <= Math.ceil((w-1)/2); k++) clear(c,y+k);
    };
    // A dense reward pocket enclosed by permanent reflectors.
    for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++) {
      if (c === x0 || c === x1 || r === y0 || r === y1) set(c,r,4,0);
      else set(c,r,rng() < (kind === 4 ? .79 : kind === 2 ? .68 : .60) ? (rng()<.08?2:1) : 0,
        2 + ((Math.floor((c-x0)/4)+Math.floor((r-y0)/4))%12));
    }
    // Internal baffles terminate short of the outer walls, so nothing gets sealed away.
    if (kind === 1 || kind === 3 || kind === 5) {
      const count = kind === 3 ? 3 : 2;
      for (let n = 0; n < count; n++) {
        const ry = y0 + 4 + Math.floor((n + .5) * Math.max(1,y1-y0-8) / count);
        if (kind === 5) {
          const cx = midX + (n ? 2 : -2);
          for (let r = y0+3; r <= y1-3; r++) if (Math.abs(r-midY) > 3) set(cx,r,4,0);
        } else {
          const gapX = n % 2 ? x0 + 5 : x1 - 5;
          for (let c = x0 + 3; c <= x1 - 3; c++)
            if (Math.abs(c-gapX) > 3) set(c,ry,4,0);
        }
      }
    }
    // All occupied sides receive a real, ball-sized route to the common chamber.
    // Every chamber has at least a second opening, so trapped balls can escape.
    const gate = kind === 0 || kind === 3 ? 2 : kind === 4 ? 4 : 3;
    const sideGates = new Set(sides);
    if (rng() < .4) sideGates.add(rand(0,3));
    sideGates.add(0); sideGates.add(2);
    for (const side of sideGates) {
      const offset = rand(-Math.min(3,Math.floor((x1-x0)/6)), Math.min(3,Math.floor((x1-x0)/6)));
      if (side === 0) freeVertical(midX + offset, midY, bottom, gate);
      else if (side === 2) freeVertical(midX + offset, top, midY, gate);
      else {
        const shift = rand(-Math.min(3,Math.floor((y1-y0)/6)), Math.min(3,Math.floor((y1-y0)/6)));
        if (side === 1) freeHorizontal(midY + shift, left, midX, gate);
        else freeHorizontal(midY + shift, midX, right, gate);
      }
    }
    freeHorizontal(midY, x0+1, x1-1, 3);
    freeVertical(midX, y0+1, y1-1, 3);

    // Extra winding runs and openings around the chamber without closing the exits.
    if (kind === 3 || kind === 0) {
      for (let n = 0; n < 3; n++) {
        const y = y0 + 4 + n * Math.floor(Math.max(4,y1-y0-9)/3);
        const center = n % 2 ? x0 + 5 : x1 - 5;
        freeHorizontal(y, Math.max(x0+2,center-7), Math.min(x1-2,center+7), 2);
      }
    }

    // A small, bounded same-color cluster gives the Domino variation a rare authored payoff.
    if (kind === 2 || (kind === 4 && rng() < .35)) {
      const cx = Math.floor((x0 + midX) / 2), cy = Math.floor((y0 + midY) / 2);
      for (let r = cy-2; r <= cy+2; r++) for (let c = cx-2; c <= cx+2; c++) {
        if (r <= y0+1 || c <= x0+1 || r >= midY-2 || c >= midX-2) continue;
        if (hp[index(c,r)] === 4) continue;
        set(c,r,1,14);
      }
      const i = index(cx,cy);
      if (hp[i] === 1 && color[i] === 14) powers[i] = 12;
    }

    let remaining = 0, wallCount = 0, internalBricks = 0;
    for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) {
      const i = index(c,r);
      if (hp[i] === 4) {wallCount++; continue;}
      if (!hp[i]) continue;
      remaining++;
      if (c>x0&&c<x1&&r>y0&&r<y1)internalBricks++;
      if (!powers[i] && rewards() < (playerCount===1?.008:.012))powers[i]=1+Math.floor(rewards()*10);
    }
    // Starter capsules are selected from existing breakable bricks near each player edge.
    for (const side of sides) {
      let selected = -1, dist = Infinity;
      for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) {
        const i = index(c,r);
        if (hp[i] !== 1 || powers[i]) continue;
        const d = side===0?bottom-r:side===2?r-top:side===1?c-left:right-c;
        const centerDistance = side===0||side===2?Math.abs(c-midX):Math.abs(r-midY);
        const measure = d * 8 + centerDistance;
        if (measure < dist) {dist=measure;selected=i;}
      }
      if (selected >= 0) powers[selected] = 11;
    }

    // Conservative reachability check: treat destructible bricks as eventually removable.
    // Permanent reflectors may never isolate a region or close an entry.
    const seen = new Uint8Array(size), queue = new Int32Array(size);
    let head = 0, tail = 0;
    const begin = index(midX,bottom);
    if (hp[begin] !== 4) {seen[begin]=1;queue[tail++]=begin;}
    while (head < tail) {
      const i=queue[head++], c=i%cols, r=Math.floor(i/cols);
      for (const [dc,dr] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const x=c+dc,y=r+dr;
        if (!inField(x,y)) continue;
        const j=index(x,y);
        if (seen[j] || hp[j]===4) continue;
        seen[j]=1;queue[tail++]=j;
      }
    }
    let inaccessible = 0;
    for (let r=top;r<=bottom;r++)for(let c=left;c<=right;c++){
      const i=index(c,r);if(hp[i]!==4&&!seen[i])inaccessible++;
    }
    const minPocket=Math.max(8,Math.floor((x1-x0-1)*(y1-y0-1)*.1));
    const valid = inaccessible===0 && internalBricks>=minPocket && wallCount>=24 && remaining>Math.floor(width*height*.22);
    // Selection is deterministic and bounded; favor packed pockets over oversized blocking walls.
    const score = internalBricks * 2 + remaining*.12 - wallCount*.3;
    return {valid,score,hp,color,powers,remaining,wallCount};
  }
  const a=candidate(0), b=candidate(1);
  const chosen=b.valid&&(!a.valid||b.score>a.score)?b:a;
  if (!chosen.valid) return {...base,generatorVersion:2,pattern:"fallback"};
  return {
    ...base,
    hp:Array.from(chosen.hp,x=>String(x)).join(""),
    colors:Array.from(chosen.color,x=>x.toString(16)).join(""),
    powerups:Array.from(chosen.powers,x=>x.toString(16)).join(""),
    wallColors:[...base.wallColors.slice(0,4),"#5c7980"],
    vaporWalls:[...base.vaporWalls.slice(0,4),"#5c7980"],
    archetype: 8 + kind,
    pattern: kinds[kind], generatorVersion:2, quad: playerCount>1,
    total:chosen.remaining,remaining:chosen.remaining,
    centerX:arena.gridX+(left+right+1)*arena.cell/2,
    centerY:arena.gridY+(top+bottom+1)*arena.cell/2
  };
}
