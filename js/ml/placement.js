/**
 * Placement model encoding, interface v1 — JS port of Nexus_Mind
 * src/mind/training/placement.py (plus the parts of House / BuildingSite /
 * SolarOrientation it depends on). Both sides must compute these identically;
 * tests/placement.test.mjs checks this file against
 * Nexus_Mind docs/samples/placement_test_vectors.json.
 *
 *   site_scalar  float32[16]              SCALAR_FIELDS
 *   site_grid    float32[14, 12, 12]      GRID_CHANNELS, per cell (row, col); padding cells 0
 *   remaining    float32[T]               modules of each type still to place
 *   layout       float32[3, 12, 12, T+5]  one-hot type (T), one-hot rotation (4), void_over (1)
 *   module_type  int64, step int64
 *   logits       float32[1728]            action = ((level*12 + row)*12 + col)*4 + rotation
 */

export const R = 12, C = 12, L = 3, N_ROT = 4;
export const N_ACTIONS = L * R * C * N_ROT;
export const GRID = 3.75;

export const VOCAB = [
    'NX_ELE_ENT_00', 'NX_ELE_EPO_00', 'NX_ELE_LIV_00', 'NX_ELE_DIN_00', 'NX_ELE_KIT_00', 'NX_ELE_KIT_01',
    'NX_ELE_MBR_00', 'NX_ELE_MBA_00', 'NX_ELE_TRA_00', 'NX_ELE_OFF_00', 'NX_ELE_LIB_00', 'NX_ELE_SPA_00',
    'NX_ELE_PBR_00', 'NX_ELE_PBA_00', 'NX_ELE_SBR_00', 'NX_ELE_SBA_00', 'NX_ELE_GBR_00', 'NX_ELE_GAR_00',
    'NX_ELE_STA_00', 'NX_ELE_CON_00',
];
export const T = VOCAB.length;
export const TYPE_INDEX = Object.fromEntries(VOCAB.map((t, i) => [t, i]));
export const STAIRS = 'NX_ELE_STA_00', VOID = 'NX_ELE_CON_00';
export const SCALAR_FIELDS = ['north_sin', 'north_cos', 'max_levels', 'max_footprint', 'floor_height', 'rows', 'cols',
    'access_S', 'access_N', 'access_E', 'access_W', 'nd_S', 'nd_N', 'nd_E', 'nd_W', 'grid_offset_m'];
export const GRID_CHANNELS = ['allowed', 'access_cell', 'view_N', 'view_E', 'view_S', 'view_W',
    'privacy_N', 'privacy_E', 'privacy_S', 'privacy_W', 'solar_N', 'solar_E', 'solar_S', 'solar_W'];
const DIRS = ['N', 'E', 'S', 'W'];

/** Post-processing relabels drawing variants (STA_01/02, CON_01); the model uses solver types. */
export function solverType(t) {
    if (t.startsWith('NX_ELE_STA_')) return STAIRS;
    if (t.startsWith('NX_ELE_CON_')) return VOID;
    return t;
}

export const actionIndex = (level, row, col, rot) => ((level * R + row) * C + col) * N_ROT + rot;
export function decodeAction(a) {
    const rot = a % N_ROT; a = Math.floor(a / N_ROT);
    const col = a % C; a = Math.floor(a / C);
    return { level: Math.floor(a / R), row: a % R, col, rot };
}

/* ------------------------------------------------------------------ site */

/** BuildingSite defaults + from_json (only fields that matter for the encoding). */
export function normaliseSite(site) {
    const four = (v, d) => ({ S: d.S, N: d.N, E: d.E, W: d.W, ...(v ?? {}) });
    return {
        north_angle: site.north_angle ?? 0,
        hasNorth: site.north_angle !== undefined && site.north_angle !== null,
        floor_height: site.floor_height ?? 3.0,
        max_levels: site.max_levels ?? 3,
        max_modules: site.max_modules ?? 20,
        max_modules_footprint: site.max_modules_footprint ?? 20,
        neighbours_distance: four(site.neighbours_distance, { S: 15, N: 5, E: 3, W: 3 }),
        access: four(site.access, { S: true, N: false, E: false, W: false }),
        setbacks: four(site.setbacks, { S: 5, N: 3, E: 3, W: 3 }),
        building_site_size: site.building_site_size ?? [30, 30],
        privacy_distance: site.privacy_distance ?? 6.0,
        view_corridor_distance: site.view_corridor_distance ?? 12.0,
    };
}

/** SolarOrientation.calculate_facade_exposure (sun_azimuth 45, delta 30). */
export function solarExposure(northAngle, sunAzimuth = 45, delta = 30) {
    const mod = (x) => ((x % 360) + 360) % 360;
    const lo = mod(270 - sunAzimuth - (90 - delta)), hi = mod(270 + sunAzimuth + (90 - delta));
    const axis = { N: mod(90 - northAngle), E: mod(0 - northAngle), S: mod(270 - northAngle), W: mod(180 - northAngle) };
    const out = {};
    for (const d of DIRS) {
        const a = axis[d];
        out[d] = lo > hi ? (a >= lo || a <= hi) : (a >= lo && a <= hi);
    }
    return out;
}

/** House grid: shape, distance_from_grid, cells (full rectangle; no aggregation mask). */
export function siteGrid(siteIn) {
    const s = normaliseSite(siteIn);
    const bw = s.building_site_size[0] - s.setbacks.W - s.setbacks.E;
    const bd = s.building_site_size[1] - s.setbacks.N - s.setbacks.S;
    const rows = Math.floor(bd / GRID), cols = Math.floor(bw / GRID);
    const dx = 0.5 * (bw - cols * GRID), dy = 0.5 * (bd - rows * GRID);
    const distanceFromGrid = { S: dy + s.setbacks.S, N: dy + s.setbacks.N, E: dx + s.setbacks.E, W: dx + s.setbacks.W };
    const cells = [];
    for (let x = 0; x < rows; x++) for (let y = 0; y < cols; y++) cells.push([x, y]);
    return { site: s, rows, cols, buildable: [bw, bd], distanceFromGrid, cells };
}

/** House.process_cells: per-cell view / privacy (solar per cell is not used by the encoding). */
function cellFlags(g) {
    const { site: s, rows: r, cols: c, distanceFromGrid } = g;
    const cover = {};
    for (const d of ['S', 'N', 'E', 'W']) {
        const nd = s.neighbours_distance[d] + distanceFromGrid[d];
        const v = s.view_corridor_distance - nd, p = s.privacy_distance - nd;
        cover[d] = { view: v > 0 ? Math.ceil(v / GRID) : 0, privacy: p > 0 ? Math.ceil(p / GRID) : 0 };
    }
    return ([x, y]) => {
        const depth = { S: r - x, N: x + 1, W: y + 1, E: c - y };
        const view = {}, privacy = {};
        for (const d of DIRS) {
            view[d] = !(depth[d] <= cover[d].view);
            privacy[d] = !(depth[d] <= cover[d].privacy);
        }
        return { view, privacy };
    };
}

/** Outermost cell towards each access side (ElementHouseSolver.access_const). */
export function accessCells(rows, cols, cells, access) {
    const has = new Set(cells.map(([r, k]) => `${r},${k}`));
    const out = new Set();
    for (const [r, k] of cells) {
        let ok = false;
        if (access.N) { let free = true; for (let rr = 0; rr < r; rr++) if (has.has(`${rr},${k}`)) { free = false; break; } ok ||= free; }
        if (!ok && access.S) { let free = true; for (let rr = r + 1; rr < rows; rr++) if (has.has(`${rr},${k}`)) { free = false; break; } ok ||= free; }
        if (!ok && access.W) { let free = true; for (let kk = 0; kk < k; kk++) if (has.has(`${r},${kk}`)) { free = false; break; } ok ||= free; }
        if (!ok && access.E) { let free = true; for (let kk = k + 1; kk < cols; kk++) if (has.has(`${r},${kk}`)) { free = false; break; } ok ||= free; }
        if (ok) out.add(`${r},${k}`);
    }
    return out;
}

/** site (PLOT json) -> { scalar: Float32Array(16), grid: Float32Array(14*12*12), rows, cols, ... } */
export function encodeSite(siteIn) {
    const g = siteGrid(siteIn);
    const s = g.site;
    const a = s.north_angle * Math.PI / 180;
    const scalar = Float32Array.from([
        Math.sin(a), Math.cos(a), s.max_levels, s.max_modules_footprint, s.floor_height, g.rows, g.cols,
        ...['S', 'N', 'E', 'W'].map((k) => (s.access[k] ? 1 : 0)),
        ...['S', 'N', 'E', 'W'].map((k) => +s.neighbours_distance[k]),
        g.distanceFromGrid.W - s.setbacks.W,
    ]);
    const grid = new Float32Array(GRID_CHANNELS.length * R * C);
    const at = (ch, r, k) => (ch * R + r) * C + k;
    const acc = accessCells(g.rows, g.cols, g.cells, s.access);
    // from_json sets solar_exposure only when north_angle is given; otherwise all False
    const exposure = s.hasNorth ? solarExposure(s.north_angle) : { N: false, E: false, S: false, W: false };
    const flags = cellFlags(g);
    for (const [r, k] of g.cells) {
        if (r >= R || k >= C) continue;   // grids beyond the 12x12 padding are outside the model's domain
        const f = flags([r, k]);
        grid[at(0, r, k)] = 1;
        grid[at(1, r, k)] = acc.has(`${r},${k}`) ? 1 : 0;
        DIRS.forEach((d, i) => {
            grid[at(2 + i, r, k)] = f.view[d] ? 1 : 0;
            grid[at(6 + i, r, k)] = f.privacy[d] ? 1 : 0;
            grid[at(10 + i, r, k)] = exposure[d] ? 1 : 0;
        });
    }
    return { scalar, grid, rows: g.rows, cols: g.cols, cells: g.cells, accessCells: acc, exposure, distanceFromGrid: g.distanceFromGrid };
}

/* ------------------------------------------------------------------ order and steps */

/** modules: [{id, type, void_over}] -> steps (arrays of modules; the stair step holds every stair). */
export function moduleOrder(modules) {
    const mods = [...modules].sort((a, b) => a.id - b.id).map((m) => ({ ...m, type: solverType(m.type) }));
    const stairs = mods.filter((m) => m.type === STAIRS);
    const voids = new Map(mods.filter((m) => m.type === VOID && m.void_over != null).map((m) => [m.void_over, m]));
    const steps = stairs.length ? [stairs] : [];
    for (const m of mods) {
        if (m.type === STAIRS || (m.type === VOID && m.void_over != null)) continue;
        steps.push([m]);
        if (voids.has(m.id)) steps.push([voids.get(m.id)]);
    }
    return steps;
}

/** Empty decoder state for a module list (counts per type). */
export function newState(types) {
    const layout = new Float32Array(L * R * C * (T + 5));
    const remaining = new Float32Array(T);
    for (const t of types) remaining[TYPE_INDEX[solverType(t)]] += 1;
    return { layout, remaining };
}

const layoutAt = (lvl, r, c, ch) => ((lvl * R + r) * C + c) * (T + 5) + ch;

/** Write a placed module into the decoder state. */
export function place(state, type, level, row, col, rot, voidOver = false) {
    const t = TYPE_INDEX[solverType(type)];
    state.layout[layoutAt(level, row, col, t)] = 1;
    state.layout[layoutAt(level, row, col, T + (rot % 4))] = 1;
    if (voidOver) state.layout[layoutAt(level, row, col, T + 4)] = 1;
    state.remaining[t] -= 1;
}

/** Solved house_to_json -> [{ layout, remaining, moduleType, step, target }] (training_steps). */
export function trainingSteps(house) {
    const placed = house.modules.filter((m) => m.position?.[0] != null).map((m) => ({ ...m, type: solverType(m.type) }));
    const steps = moduleOrder(placed);
    const state = newState(placed.map((m) => m.type));
    return steps.map((group, s) => {
        const first = group.reduce((a, b) => (b.position[2] < a.position[2] ? b : a));
        const [r, c, lvl] = first.position;
        const out = {
            layout: state.layout.slice(), remaining: state.remaining.slice(),
            moduleType: TYPE_INDEX[first.type], step: s, target: actionIndex(lvl, r, c, first.rotation % 4),
        };
        for (const m of group) {
            const [mr, mc, ml] = m.position;
            place(state, m.type, ml, mr, mc, m.rotation % 4, m.void_over != null);
        }
        return out;
    });
}
