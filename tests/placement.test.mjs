// Checks js/ml/placement.js against Nexus_Mind's reference test vectors.
// Run: node tests/placement.test.mjs  (refresh the fixture from Nexus_Mind docs/samples/placement_test_vectors.json)
import fs from 'fs';
import { encodeSite, moduleOrder, trainingSteps, GRID_CHANNELS, R, C, VOCAB } from '../js/ml/placement.js';

const tv = JSON.parse(fs.readFileSync(new URL('./fixtures/placement_test_vectors.json', import.meta.url)));
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('  FAIL', msg); } };
if (JSON.stringify(tv.sidecar.vocabulary) !== JSON.stringify(VOCAB)) { fail++; console.log('FAIL vocabulary differs'); }

tv.cases.forEach((cs, i) => {
  const e = encodeSite(cs.site);
  const bad = cs.site_scalar.map((v, k) => [k, v, e.scalar[k]]).filter(([, v, w]) => Math.abs(v - w) > 1e-4);
  check(!bad.length, `case ${i} site_scalar ${JSON.stringify(bad)}`);
  const want = new Set(cs.site_grid_nonzero.map(([ch, r, c]) => `${ch},${r},${c}`));
  const got = new Set();
  for (let ch = 0; ch < GRID_CHANNELS.length; ch++) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++)
    if (e.grid[(ch * R + r) * C + c]) got.add(`${ch},${r},${c}`);
  const missing = [...want].filter((x) => !got.has(x)), extra = [...got].filter((x) => !want.has(x));
  check(!missing.length && !extra.length, `case ${i} site_grid missing ${missing.slice(0, 6)} extra ${extra.slice(0, 6)} (${missing.length}/${extra.length})`);
  const order = moduleOrder(cs.house.modules).map((g) => g.map((m) => m.type));
  check(JSON.stringify(order) === JSON.stringify(cs.module_order), `case ${i} module_order`);
  const steps = trainingSteps(cs.house);
  check(JSON.stringify(steps.map((s) => s.target)) === JSON.stringify(cs.targets), `case ${i} targets`);
  check(JSON.stringify(Array.from(steps[0].remaining)) === JSON.stringify(cs.first_step_remaining), `case ${i} first remaining`);
  console.log(`case ${i}: ${cs.site.building_site_size.join('x')} m, north ${cs.site.north_angle}, ${steps.length} steps`);
});
console.log(fail ? `${fail} failure(s)` : `all ${tv.cases.length} cases match the Python reference`);
process.exit(fail ? 1 : 0);
