import { FeasibilityModel } from '../../js/ml/feasibility.js';
import fs from 'fs';
const m = new FeasibilityModel(JSON.parse(fs.readFileSync(new URL('../../assets/ml/configurator_data.json', import.meta.url))));
const brief = { Bedrooms: 2, Office: true, DoubleHeightLivingRoom: true, Garden: true };
for (const n of [0, 45, 90, 180, 220, 270]) {
  const plot = { north_angle: n, building_site_size: [15, 30], max_modules_footprint: 16, max_levels: 2, setbacks: { S: 5, E: 1.5, N: 10, W: 1.5 }, access: { S: true }, neighbours_distance: { S: 15, E: 10, N: 5, W: 3 } };
  const a = m.assess(brief, plot); const t = a.ranked.top[0];
  console.log(`north ${n}: p=${(a.p*100).toFixed(0)}% pick #${t.idx} solved at ${m.library[t.idx].s[3]}° (off ${t.turn.toFixed(0)}°) roomdiff ${t.diff} fits ${t.fits}`);
}
