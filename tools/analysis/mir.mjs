import { FeasibilityModel } from '../../js/ml/feasibility.js';
import { renderPlan } from '../../js/plan/plan-renderer.js';
import fs from 'fs';
const m = new FeasibilityModel(JSON.parse(fs.readFileSync(new URL('../../assets/ml/configurator_data.json', import.meta.url))));
const lib = JSON.parse(fs.readFileSync(new URL('../../assets/modules/module_library.json', import.meta.url)));
const a = renderPlan(lib, m.toSolution(152, false), 0, { title: 'Layout #152 as solved (north 92°)' });
const b = renderPlan(lib, m.toSolution(152, true), 0, { title: 'Mirrored (serves north 268°)' });
fs.writeFileSync('mirror_example.svg', `<div style="display:flex;gap:10px;background:#fff"><div style="width:560px;height:640px">${a}</div><div style="width:560px;height:640px">${b}</div></div>`);
