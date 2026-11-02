import { FeasibilityModel } from '../../js/ml/feasibility.js';
import fs from 'fs';
const d = JSON.parse(fs.readFileSync(new URL('../../assets/ml/configurator_data.json', import.meta.url)));
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
function run(lib, label) {
  const m = new FeasibilityModel({ ...d, library: lib });
  let exact = 0, good = 0, n = 400;
  seed = 7;
  for (let i = 0; i < n; i++) {
    const brief = { Bedrooms: pick([1,2,3,4]) };
    for (const k of ['Guest','Parents','Office','Library','Spa','LargeLivingRoom','DoubleHeightLivingRoom','DoubleHeightDiningRoom','CompactKitchen','Garden']) brief[k] = rnd() < 0.3;
    const w = 12 + rnd() * 18, dd = 20 + rnd() * 25;
    const plot = { north_angle: rnd() * 360, building_site_size: [w, dd], max_modules_footprint: Math.floor((0.25 + rnd() * 0.3) * w * dd / 14.0625), max_levels: pick([1,2,2,2,3]),
      setbacks: { S: 3 + rnd() * 3, N: 3 + rnd() * 7, E: 1.5 + rnd() * 1.5, W: 1.5 + rnd() * 1.5 }, access: { S: true, E: rnd() < 0.15, W: rnd() < 0.15 }, neighbours_distance: {} };
    const t = m.assess(brief, plot).ranked.top[0];
    const ok = t.diff === 0 && t.fits && t.porchOk;
    if (ok) exact++;
    if (ok && t.turn <= 30) good++;
  }
  console.log(`${label}: exact rooms + fits plot + porch ok: ${(100*exact/n).toFixed(0)}%   ...and orientation within 30°: ${(100*good/n).toFixed(0)}%`);
}
run(d.library, `library ${d.library.length}`);
run(d.library.filter((_, i) => i % 2 === 0), `library ${Math.ceil(d.library.length/2)} (half)`);
run(d.library.filter((_, i) => i % 4 === 0), `library ${Math.ceil(d.library.length/4)} (quarter)`);
