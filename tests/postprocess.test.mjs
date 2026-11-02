// Checks js/ml/postprocess.js against Nexus_Mind docs/samples/post_process_fixture.json.
import fs from 'fs';
import { postProcess } from '../js/ml/postprocess.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/post_process_fixture.json', import.meta.url)));
const config = JSON.parse(fs.readFileSync(new URL('../assets/ml/module_config.json', import.meta.url)));
let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
fx.cases.forEach((cs, i) => {
  const hj = cs.expected_post_process.house_json;
  const out = postProcess({ modules: cs.solver_output, treeEdges: cs.connectivity_tree_edges, config,
    gridShape: hj.grid_shape, numLevels: hj.grid_shape[2] });
  const byId = new Map(out.modules.map((m) => [m.id, m]));
  const fields = ['all_neighbours', 'secondary_neighbours', 'edge_context', 'passage', 'norm_passage', 'access_points', 'flip'];
  const bad = {};
  for (const e of cs.expected_post_process.modules) {
    const m = byId.get(e.id);
    for (const k of fields) if (!eq(m[k], e[k])) (bad[k] ??= []).push(`#${e.id} ${m.type}: got ${JSON.stringify(m[k])} want ${JSON.stringify(e[k])}`);
    if (m.typeFinal !== e.final_type) (bad.final_type ??= []).push(`#${e.id}: ${m.typeFinal} vs ${e.final_type}`);
  }
  const norm = (ps) => ps.map((p) => JSON.stringify(p)).sort();
  if (!eq(norm(out.house.partitions), norm(hj.partitions))) bad.partitions = [`got ${out.house.partitions.length}, want ${hj.partitions.length}`,
    ...norm(hj.partitions).filter((x) => !norm(out.house.partitions).includes(x)).slice(0, 4).map((x) => 'missing ' + x),
    ...norm(out.house.partitions).filter((x) => !norm(hj.partitions).includes(x)).slice(0, 4).map((x) => 'extra ' + x)];
  if (!eq(out.house.summary, hj.summary)) bad.summary = [`got ${JSON.stringify(out.house.summary)} want ${JSON.stringify(hj.summary)}`];
  const keys = Object.keys(bad);
  if (keys.length) { fail++; console.log(`case ${i}: FAIL`); for (const k of keys) console.log(`  ${k}:`, bad[k].slice(0, 4).join('\n    ')); }
  else console.log(`case ${i}: ${cs.solver_output.length} modules, ${hj.partitions.length} partitions, ${out.modules.filter((m) => m.flip).length} flips — match`);
});
process.exit(fail ? 1 : 0);
