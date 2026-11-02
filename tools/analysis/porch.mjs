import { FeasibilityModel } from '../../js/ml/feasibility.js';
import fs from 'fs';
const m = new FeasibilityModel(JSON.parse(fs.readFileSync(new URL('../../assets/ml/configurator_data.json', import.meta.url))));
const T = m.typeIds;
function porchSides(e) {
  const g0 = new Set(); let r0=1e9,r1=-1,c0=1e9,c1=-1, p=null;
  for (let i=0;i<e.m.length;i+=5){ const [t,r,c,l]=e.m.slice(i,i+4); if(l===0){g0.add(`${r},${c}`); r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);} if(T[t]==='NX_ELE_EPO_00') p=[r,c]; }
  if (!p) return [];
  const [r,c]=p, s=[];
  if (r===r1 && !g0.has(`${r+1},${c}`)) s.push('S'); if (r===r0 && !g0.has(`${r-1},${c}`)) s.push('N');
  if (c===c1 && !g0.has(`${r},${c+1}`)) s.push('E'); if (c===c0 && !g0.has(`${r},${c-1}`)) s.push('W');
  return s;
}
const brief = { Bedrooms: 2, Office: true, DoubleHeightLivingRoom: true, Garden: true };
let bad = 0, total = 0;
for (const n of [0,30,60,90,120,150,180,210,240,270,300,330]) {
  const plot = { north_angle: n, building_site_size: [15, 30], max_modules_footprint: 16, max_levels: 2, setbacks: { S: 5, E: 1.5, N: 10, W: 1.5 }, access: { S: true }, neighbours_distance: {} };
  const top = m.assess(brief, plot).ranked.top;
  const s = top.map(t => { let x = porchSides(m.library[t.idx]); if (t.mirror) x = x.map(k => ({E:'W',W:'E'})[k] ?? k); return x.join('')||'-'; });
  bad += s.filter(x=>!x.includes('S')).length; total += s.length;
  console.log(`north ${n}: porch street-facing sides of top 8:`, s.join(' '));
}
console.log(`not facing street: ${bad}/${total}`);
