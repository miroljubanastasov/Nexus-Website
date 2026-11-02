/**
 * Nexus plan renderer: draws floor plans from solver output in the browser,
 * replacing the Rhino Compute + Grasshopper (Configurator_Element_Drawings.gh)
 * round trip.
 *
 * Inputs
 *   lib      module library JSON (assets/modules/module_library.json,
 *            produced by tools/export_module_library.py from
 *            assets/rhino/NX_ELEMENT_MODULES.3dm)
 *   solution solver output: { house: { grid_shape, modules, partitions? } }
 *            or the house object itself
 *   level    0-based level index
 *
 * Usage
 *   import { loadModuleLibrary, renderPlan } from './js/plan/plan-renderer.js';
 *   const lib = await loadModuleLibrary('assets/modules/module_library.json');
 *   el.innerHTML = renderPlan(lib, solution, 0);
 *
 * Geometry rules (reverse-engineered from the Grasshopper definition and its
 * SVG output):
 *   - Cells are 3.75 m. The solver grid is matrix-like: position[0] (x) is
 *     the row (downwards in plan), position[1] (y) the column (rightwards).
 *   - Module blocks are centred on their cell. A module is mirrored in local
 *     X when `flip` is set, then turned `rotation` quarter turns clockwise.
 *   - A module side facing a cell that holds no indoor module on the same
 *     level is a facade: a 0.305 m wall (0.075 inside the grid line, 0.23
 *     outside), opened where the block has 100_FACADE OPENNING REF and glazed
 *     there (300_WALL_ELE lines). Openings stop 0.2375 m short of the grid
 *     corners, where the columns are.
 *   - A side shared with another indoor module keeps only the block's
 *     100_INTERRIOR WALL REF lines, drawn 0.15 m thick. Facade openings on a
 *     shared side become open connections.
 *   - Wall-ref lines inside a module are 0.15 m walls. Walls are interrupted
 *     where 100_DOOR_OPEN_REF rectangles cross them.
 *   - 100_COLUMN REF (8 per module) are drawn as cut elements, except in
 *     open_to_sky modules (gardens).
 *   - Module types without a block in the library get a generic open module
 *     (columns, glazed facades, name label) and are listed in `missing`.
 */

export const CELL = 3.75;
const HALF = CELL / 2;
const EXT_IN = 0.075;          // facade wall: inner face, inside the grid line
const EXT_OUT = 0.23;          // facade wall: outer face, outside the grid line
const INT_HALF = 0.075;        // interior wall: half thickness
const CORNER = 0.2375;         // column zone at each grid corner
const EPS = 1e-3;

const OUTDOOR_TYPES = /^NX_ELE_(GAR|EPO)_/;
const VOID_TYPES = /^NX_ELE_CON_/;

export const DEFAULT_OPTIONS = {
    // `rotation` = clockwise quarter turns in plan (calibrated against the
    // Grasshopper SVGs; matches the solver's partition rotation N=0,E=1,S=2,W=3).
    rotationSign: -1,
    // Mirror axis for `flip` in the module-local frame: 'x' mirrors X (left/right).
    flipAxis: 'x',
    scale: 100,                // SVG user units per metre
    margin: 2.0,               // metres around the house
    furniture: true,
    entourage: false,          // people, plants (300_ENT_*)
    floorPattern: true,
    labels: true,
    areas: true,
    grid: true,
    dimensions: true,
    title: null,               // e.g. 'Ground floor'
    north: null,               // degrees; defaults to plot.north_angle when plot given
    className: 'nx-plan',
    // Optional per-level colouring of room footprints: { [type]: '#hex' }
    roomFill: null,
};

const LEVEL_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor'];

/* ------------------------------------------------------------------ */
/* Library                                                            */
/* ------------------------------------------------------------------ */

export async function loadModuleLibrary(url = new URL('../../assets/modules/module_library.json', import.meta.url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Module library ${url}: HTTP ${res.status}`);
    return res.json();
}

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                             */
/* ------------------------------------------------------------------ */

function makeXform(module, opts) {
    const [x, y] = module.position ?? [module.cell?.[0] ?? module.x, module.cell?.[1] ?? module.y];
    const k = (((module.rotation ?? 0) * opts.rotationSign) % 4 + 4) % 4;
    const cos = [1, 0, -1, 0][k];
    const sin = [0, 1, 0, -1][k];
    const fx = module.flip && opts.flipAxis === 'x' ? -1 : 1;
    const fy = module.flip && opts.flipAxis === 'y' ? -1 : 1;
    // Solver grid is matrix-like: x = row (downwards), y = column (rightwards).
    // Rhino frame (Y up): cell centre at X = column, Y = -row.
    const cx = y * CELL + HALF;
    const cy = -(x * CELL + HALF);
    // world = R * F * local + c
    const a = cos * fx, b = -sin * fy, c = sin * fx, d = cos * fy;
    return {
        a, b, c, d, cx, cy, cellX: x, cellY: y,
        pt: (p) => [a * p[0] + b * p[1] + cx, c * p[0] + d * p[1] + cy],
        dir: (v) => [a * v[0] + b * v[1], c * v[0] + d * v[1]],
    };
}

function subtractIntervals(base, cuts) {
    let out = base.map((iv) => [...iv]);
    for (const [c0, c1] of cuts) {
        const next = [];
        for (const [a, b] of out) {
            if (c1 <= a + EPS || c0 >= b - EPS) { next.push([a, b]); continue; }
            if (c0 > a + EPS) next.push([a, c0]);
            if (c1 < b - EPS) next.push([c1, b]);
        }
        out = next;
    }
    return out.filter(([a, b]) => b - a > EPS);
}

function clipInterval([a, b], lo, hi) {
    const r = [Math.max(a, lo), Math.min(b, hi)];
    return r[1] - r[0] > EPS ? r : null;
}

/** Split polylines into axis-aligned segments {axis:'h'|'v', at, t0, t1}. */
function axisSegments(items) {
    const segs = [];
    for (const it of items ?? []) {
        const p = it.p;
        const n = it.c ? p.length : p.length - 1;
        for (let i = 0; i < n; i++) {
            const A = p[i], B = p[(i + 1) % p.length];
            if (Math.abs(A[1] - B[1]) < EPS) segs.push({ axis: 'h', at: A[1], t0: Math.min(A[0], B[0]), t1: Math.max(A[0], B[0]) });
            else if (Math.abs(A[0] - B[0]) < EPS) segs.push({ axis: 'v', at: A[0], t0: Math.min(A[1], B[1]), t1: Math.max(A[1], B[1]) });
        }
    }
    return segs.filter((s) => s.t1 - s.t0 > EPS);
}

function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
}

/** Door rectangles crossing a segment line -> intervals along it. */
function doorCuts(seg, doorBoxes) {
    const cuts = [];
    for (const r of doorBoxes) {
        if (seg.axis === 'h') {
            if (seg.at >= r.y0 - EPS && seg.at <= r.y1 + EPS) cuts.push([r.x0, r.x1]);
        } else if (seg.at >= r.x0 - EPS && seg.at <= r.x1 + EPS) cuts.push([r.y0, r.y1]);
    }
    return cuts;
}

/** Local rectangle for a band along a side-aligned segment. */
function bandRect(axis, at, t0, t1, off0, off1) {
    return axis === 'h' ? [t0, at + off0, t1, at + off1] : [at + off0, t0, at + off1, t1];
}

/* ------------------------------------------------------------------ */
/* Plan model                                                         */
/* ------------------------------------------------------------------ */

const SIDES = [
    { key: 'N', axis: 'h', at: HALF, out: [0, 1] },
    { key: 'S', axis: 'h', at: -HALF, out: [0, -1] },
    { key: 'E', axis: 'v', at: HALF, out: [1, 0] },
    { key: 'W', axis: 'v', at: -HALF, out: [-1, 0] },
];

/** Generic stand-in for module types that have no block in the library yet:
 *  open plan with columns, glazed on every facade, labelled with the module name. */
function fallbackModule(lib, m) {
    const ref = lib.modules.NX_ELE_LIV_00?.layers ?? {};
    const sq = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
    return {
        name: m.name ?? m.type,
        layers: {
            '100_COLUMN REF': ref['100_COLUMN REF'] ?? [],
            '100_FACADE OPENNING REF': [{ p: sq, c: true }],
            '200_HIGHLIGHT': [{ p: sq, c: true, u: { NAME: m.name ?? m.type } }],
        },
        texts: [],
    };
}

function isIndoor(m) {
    if (typeof m.is_indoor === 'boolean') return m.is_indoor;
    return !OUTDOOR_TYPES.test(m.type ?? '');
}

/**
 * Build the world-space drawing for one level.
 * Returns { layers: {name: [{p, c}]}, walls: [[x0,y0,x1,y1]], windows: [...], texts: [...], cells: [...] }
 */
export function buildLevel(lib, solution, level = 0, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const house = solution?.house ?? solution;
    const modules = (house?.modules ?? []).filter((m) => (m.position?.[2] ?? m.level ?? 0) === level);
    const partitions = (house?.partitions ?? []).filter((p) => (p.level ?? 0) === level);

    const indoor = new Set();
    for (const m of modules) if (isIndoor(m)) indoor.add(`${m.position[0]},${m.position[1]}`);

    const out = { layers: {}, walls: [], windows: [], texts: [], cells: [], missing: [] };
    const push = (layer, item) => (out.layers[layer] ??= []).push(item);

    const drawItems = [
        ['300_FLOOR_PAT', opts.floorPattern],
        ['300_FURN_PRIM', opts.furniture],
        ['300_FURN_SEC', opts.furniture],
        ['300_ENT_PRIM', opts.entourage],
        ['300_ENT_SEC', opts.entourage],
        ['300_STAIRS_ELE', true],
        ['300_DOOR_SEC', true],
        ['300_DOOR_SYMBOL', true],
        ['200_OPEN_TO_BELOW', true],
        ['100_COLUMN REF', true],
        ['100_PARTITION_REF', true],
    ];

    const place = (m, isPartition) => {
        if (isPartition && !m.type) return;           // edge with no partition needed
        let def = lib.modules[m.type];
        const xf = makeXform(isPartition ? { ...m, position: m.cell ?? m.position } : m, opts);
        if (!def) {
            out.missing.push(m.type);
            if (isPartition) return;
            def = fallbackModule(lib, m);             // e.g. a type with no block in the .3dm yet
        }
        const L = def.layers;
        const tp = (it) => ({ p: it.p.map(xf.pt), c: it.c });

        if (!isPartition) {
            out.cells.push({
                x: xf.cellX, y: xf.cellY, type: m.type, name: m.name ?? def.label ?? def.name,
                indoor: isIndoor(m), void: VOID_TYPES.test(m.type),
            });
        }

        for (const [layer, on] of drawItems) {
            if (!on || !L[layer]) continue;
            if (layer === '100_COLUMN REF' && m.open_to_sky) continue;   // no columns in gardens
            for (const it of L[layer]) push(layer, tp(it));
        }

        // Labels from highlight zones (NAME / AREA user text)
        if (!isPartition && opts.labels) {
            const zones = (L['200_HIGHLIGHT'] ?? []).filter((z) => z.u?.NAME);
            const zs = zones.length ? zones : [{ p: [[-HALF, -HALF], [HALF, HALF]], u: { NAME: m.name ?? def.label ?? def.name } }];
            const big = zs.length === 1;
            for (const z of zs) {
                const b = bbox(z.p.map(xf.pt));
                const area = parseFloat(z.u.AREA);
                out.texts.push({
                    x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2,
                    text: big && m.name ? m.name : z.u.NAME,
                    sub: opts.areas && Number.isFinite(area) ? `${area.toFixed(1)} m²` : null,
                    size: big ? 'l' : 's',
                });
            }
        }

        // ---- walls -----------------------------------------------------
        if (!isPartition && !isIndoor(m)) return;   // outdoor modules have no walls

        const wallSegs = axisSegments(L['100_INTERRIOR WALL REF']);
        const openSegs = axisSegments(L['100_FACADE OPENNING REF']);
        const doorBoxes = (L['100_DOOR_OPEN_REF'] ?? []).map((it) => bbox(it.p));
        const rects = [];
        const glazing = [];

        const onSide = (s, side) => s.axis === side.axis && Math.abs(s.at - side.at) < EPS;

        if (!isPartition) {
            for (const side of SIDES) {
                const [dX, dY] = xf.dir(side.out);   // world direction -> grid step
                const nKey = `${xf.cellX - Math.round(dY)},${xf.cellY + Math.round(dX)}`;
                const sign = side.at > 0 ? 1 : -1;  // outward along the side normal
                const sideWalls = wallSegs.filter((s) => onSide(s, side));
                const sideOpen = openSegs.filter((s) => onSide(s, side));
                const doors = doorCuts({ axis: side.axis, at: side.at }, doorBoxes);

                if (!indoor.has(nKey)) {
                    // Facade: solid wall minus openings, glazing in the openings
                    const ext = HALF + EXT_OUT;
                    const openIv = sideOpen
                        .map((s) => clipInterval([s.t0, s.t1], -HALF + CORNER, HALF - CORNER))
                        .filter(Boolean);
                    const solid = subtractIntervals([[-ext, ext]], [...openIv, ...doors]);
                    for (const [t0, t1] of solid) rects.push(bandRect(side.axis, side.at, t0, t1, ...(sign > 0 ? [-EXT_IN, EXT_OUT] : [-EXT_OUT, EXT_IN])));
                    for (const iv of subtractIntervals(openIv, doors)) glazing.push({ axis: side.axis, at: side.at, sign, t0: iv[0], t1: iv[1] });
                } else {
                    for (const s of sideWalls) {
                        for (const [t0, t1] of subtractIntervals([[s.t0, s.t1]], doors)) {
                            rects.push(bandRect(s.axis, s.at, t0 - INT_HALF, t1 + INT_HALF, -INT_HALF, INT_HALF));
                        }
                    }
                }
            }
        }
        // Inner walls (not on the module perimeter) and partition walls
        for (const s of wallSegs) {
            if (!isPartition && SIDES.some((side) => onSide(s, side))) continue;
            const cuts = doorCuts(s, doorBoxes);
            for (const [t0, t1] of subtractIntervals([[s.t0, s.t1]], cuts)) {
                const ext0 = Math.abs(t0 - s.t0) < EPS ? INT_HALF : 0;
                const ext1 = Math.abs(t1 - s.t1) < EPS ? INT_HALF : 0;
                rects.push(bandRect(s.axis, s.at, t0 - ext0, t1 + ext1, -INT_HALF, INT_HALF));
            }
        }

        for (const [x0, y0, x1, y1] of rects) {
            const b = bbox([xf.pt([x0, y0]), xf.pt([x1, y1])]);
            out.walls.push([b.x0, b.y0, b.x1, b.y1]);
        }
        for (const g of glazing) {
            // three lines: outer face, middle (glass), inner face of the facade wall
            const offs = g.sign > 0 ? [EXT_OUT, (EXT_OUT - EXT_IN) / 2, -EXT_IN] : [-EXT_OUT, -(EXT_OUT - EXT_IN) / 2, EXT_IN];
            const lines = offs.map((o) => (g.axis === 'h'
                ? [[g.t0, g.at + o], [g.t1, g.at + o]]
                : [[g.at + o, g.t0], [g.at + o, g.t1]]).map(xf.pt));
            out.windows.push(...lines);
            // jambs
            const j0 = g.axis === 'h' ? [[g.t0, g.at + offs[0]], [g.t0, g.at + offs[2]]] : [[g.at + offs[0], g.t0], [g.at + offs[2], g.t0]];
            const j1 = g.axis === 'h' ? [[g.t1, g.at + offs[0]], [g.t1, g.at + offs[2]]] : [[g.at + offs[0], g.t1], [g.at + offs[2], g.t1]];
            out.windows.push(j0.map(xf.pt), j1.map(xf.pt));
        }
    };

    for (const m of modules) place(m, false);
    for (const p of partitions) place(p, true);
    return out;
}

/* ------------------------------------------------------------------ */
/* SVG output                                                         */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = (v) => Math.round(v * 100) / 100;

const STYLE = `
.nx-plan{--nx-ink:#1d1d1f;--nx-mid:#6b6b70;--nx-light:#b9b9be;--nx-glass:#4a8fd6;--nx-bg:#ffffff;--nx-void:#9a9aa0;--nx-out:#eef4ea}
@media (prefers-color-scheme:dark){.nx-plan.nx-auto{--nx-ink:#ececf0;--nx-mid:#a3a3aa;--nx-light:#5b5b62;--nx-glass:#7db3ff;--nx-bg:#141416;--nx-void:#8a8a90;--nx-out:#1e2a1c}}
.nx-plan .bg{fill:var(--nx-bg)}
.nx-plan path,.nx-plan line{vector-effect:non-scaling-stroke;fill:none;stroke-linecap:round;stroke-linejoin:round}
.nx-plan .wall-cut{fill:var(--nx-ink);stroke:var(--nx-ink);stroke-width:.6}
.nx-plan .wall-ele{stroke:var(--nx-glass);stroke-width:.8}
.nx-plan .column{fill:var(--nx-ink);stroke:var(--nx-ink);stroke-width:.4}
.nx-plan .furn-prim{stroke:var(--nx-mid);stroke-width:.9}
.nx-plan .furn-sec{stroke:var(--nx-light);stroke-width:.6}
.nx-plan .ent{stroke:var(--nx-light);stroke-width:.5}
.nx-plan .floor-pat{stroke:var(--nx-light);stroke-width:.4;stroke-dasharray:2 3}
.nx-plan .stairs{stroke:var(--nx-mid);stroke-width:.8}
.nx-plan .door-sec{stroke:var(--nx-ink);stroke-width:.8}
.nx-plan .door-sym{stroke:var(--nx-mid);stroke-width:.6}
.nx-plan .void{stroke:var(--nx-void);stroke-width:.7;stroke-dasharray:6 4}
.nx-plan .outdoor{fill:var(--nx-out)}
.nx-plan .partition{stroke:var(--nx-mid);stroke-width:1.2;stroke-dasharray:4 3}
.nx-plan .grid{stroke:var(--nx-light);stroke-width:.5;stroke-dasharray:8 4 1 4}
.nx-plan .dim{stroke:var(--nx-mid);stroke-width:.6}
.nx-plan text{fill:var(--nx-ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-anchor:middle;dominant-baseline:middle}
.nx-plan .lbl-l{font-size:22px;font-weight:600}
.nx-plan .lbl-s{font-size:15px;font-weight:500}
.nx-plan .lbl-sub{font-size:13px;fill:var(--nx-mid)}
.nx-plan .dim-t{font-size:15px;fill:var(--nx-mid)}
.nx-plan .grid-t{font-size:13px;fill:var(--nx-mid)}
.nx-plan .title{font-size:26px;font-weight:600;text-anchor:start}
`;

const LAYER_CLASS = {
    '300_FLOOR_PAT': 'floor-pat',
    '300_FURN_PRIM': 'furn-prim',
    '300_FURN_SEC': 'furn-sec',
    '300_ENT_PRIM': 'ent',
    '300_ENT_SEC': 'ent',
    '300_STAIRS_ELE': 'stairs',
    '300_DOOR_SEC': 'door-sec',
    '300_DOOR_SYMBOL': 'door-sym',
    '200_OPEN_TO_BELOW': 'void',
    '100_PARTITION_REF': 'partition',
};

/**
 * Render one level to an SVG string.
 * @param {object} lib       module library
 * @param {object} solution  { house } or house
 * @param {number} level
 * @param {object} [options] see DEFAULT_OPTIONS; options.plot may carry the PLOT json
 */
export function renderPlan(lib, solution, level = 0, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const house = solution?.house ?? solution;
    const [nx, ny] = house.grid_shape ?? [4, 3];
    const model = buildLevel(lib, house, level, opts);
    const S = opts.scale;

    // world (Rhino, Y up) -> view (metres, y down): column = solver y, row = solver x
    const view = ([X, Y]) => [X, -Y];
    const W = ny * CELL;
    const H = nx * CELL;
    const m = opts.margin;
    const top = opts.title ? 0.9 : 0;
    const vb = [-m * S, (-m - top) * S, (W + 2 * m) * S, (H + 2 * m + top) * S];
    const V = ([x, y]) => `${r2(x * S)},${r2(y * S)}`;
    const P = (p) => V(view(p));
    const path = (it) => `M${it.p.map(P).join('L')}${it.c ? 'Z' : ''}`;
    // cell rectangle in view space (c.x = row, c.y = column)
    const cellQuad = (c) => {
        const x0 = c.y * CELL, y0 = c.x * CELL;
        return `M${[[x0, y0], [x0 + CELL, y0], [x0 + CELL, y0 + CELL], [x0, y0 + CELL]].map(V).join('L')}Z`;
    };

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="${opts.className}${options.autoDark === false ? '' : ' nx-auto'}" viewBox="${vb.map(r2).join(' ')}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" data-level="${level}" role="img" aria-label="${esc(opts.title ?? LEVEL_NAMES[level] ?? `Level ${level}`)}">`);
    parts.push(`<style>${STYLE}</style>`);
    parts.push(`<rect class="bg" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"/>`);
    if (opts.title) parts.push(`<text class="title" x="0" y="${r2((-m - top / 2 + 0.6) * S)}">${esc(opts.title)}</text>`);

    // outdoor cells tint
    const outdoor = model.cells.filter((c) => !c.indoor);
    if (outdoor.length) {
        parts.push(`<g class="nx-layer" data-layer="outdoor"><path class="outdoor" style="stroke:none" d="${outdoor.map(cellQuad).join('')}"/></g>`);
    }
    if (opts.roomFill) {
        parts.push('<g class="nx-layer" data-layer="room-fill">');
        for (const c of model.cells) {
            const f = opts.roomFill[c.type] ?? opts.roomFill[c.type?.slice(7, 10)];
            if (f) parts.push(`<path style="fill:${esc(f)};stroke:none" d="${cellQuad(c)}"/>`);
        }
        parts.push('</g>');
    }

    // structural grid (view space)
    if (opts.grid && model.cells.length) {
        const cols = new Set(), rows = new Set();
        for (const c of model.cells) { cols.add(c.y); cols.add(c.y + 1); rows.add(c.x); rows.add(c.x + 1); }
        const gc = [...cols].sort((a, b) => a - b), gr = [...rows].sort((a, b) => a - b);
        const ext = 0.8;
        const d = [
            ...gc.map((j) => `M${V([j * CELL, gr[0] * CELL - ext])}L${V([j * CELL, gr.at(-1) * CELL + ext])}`),
            ...gr.map((i) => `M${V([gc[0] * CELL - ext, i * CELL])}L${V([gc.at(-1) * CELL + ext, i * CELL])}`),
        ].join('');
        parts.push(`<g class="nx-layer" data-layer="grid"><path class="grid" d="${d}"/></g>`);
    }

    for (const [layer, cls] of Object.entries(LAYER_CLASS)) {
        const items = model.layers[layer];
        if (!items?.length) continue;
        parts.push(`<g class="nx-layer" data-layer="${layer}">`);
        parts.push(`<path class="${cls}" d="${items.map(path).join('')}"/>`);
        parts.push('</g>');
    }

    // walls (filled bands; overlapping fills read as one cut)
    if (model.walls.length) {
        const d = model.walls.map(([x0, y0, x1, y1]) => `M${P([x0, y0])}L${P([x1, y0])}L${P([x1, y1])}L${P([x0, y1])}Z`).join('');
        parts.push(`<g class="nx-layer" data-layer="300_WALL_CUT"><path class="wall-cut" d="${d}"/></g>`);
    }
    if (model.layers['100_COLUMN REF']?.length) {
        parts.push(`<g class="nx-layer" data-layer="100_COLUMN REF"><path class="column" d="${model.layers['100_COLUMN REF'].map(path).join('')}"/></g>`);
    }
    if (model.windows.length) {
        parts.push(`<g class="nx-layer" data-layer="300_WALL_ELE"><path class="wall-ele" d="${model.windows.map((l) => `M${P(l[0])}L${P(l[1])}`).join('')}"/></g>`);
    }

    // labels
    if (opts.labels && model.texts.length) {
        parts.push('<g class="nx-layer" data-layer="labels">');
        for (const t of model.texts) {
            const [x, y] = view([t.x, t.y]);
            const dy = t.sub ? (t.size === 'l' ? -11 : -8) : 0;
            parts.push(`<text class="lbl-${t.size}" x="${r2(x * S)}" y="${r2(y * S + dy)}">${esc(t.text)}</text>`);
            if (t.sub) parts.push(`<text class="lbl-sub" x="${r2(x * S)}" y="${r2(y * S + (t.size === 'l' ? 14 : 10))}">${esc(t.sub)}</text>`);
        }
        parts.push('</g>');
    }

    // overall dimensions (outer wall faces of the occupied cells)
    if (opts.dimensions && model.cells.length) {
        const indoorCells = model.cells.filter((c) => c.indoor);
        const cs = indoorCells.length ? indoorCells : model.cells;
        const pts = cs.flatMap((c) => [[c.y * CELL, c.x * CELL], [(c.y + 1) * CELL, (c.x + 1) * CELL]]);
        const b = bbox(pts);
        const x0 = b.x0 - EXT_OUT, x1 = b.x1 + EXT_OUT, y0 = b.y0 - EXT_OUT, y1 = b.y1 + EXT_OUT;
        const off = 1.2;
        const tick = (x, y) => `M${r2((x - 0.12) * S)},${r2((y + 0.12) * S)}L${r2((x + 0.12) * S)},${r2((y - 0.12) * S)}`;
        const yd = y1 + off, xd = x1 + off;
        parts.push('<g class="nx-layer" data-layer="dimensions">');
        parts.push(`<path class="dim" d="M${r2(x0 * S)},${r2(yd * S)}L${r2(x1 * S)},${r2(yd * S)}${tick(x0, yd)}${tick(x1, yd)}M${r2(xd * S)},${r2(y0 * S)}L${r2(xd * S)},${r2(y1 * S)}${tick(xd, y0)}${tick(xd, y1)}"/>`);
        parts.push(`<text class="dim-t" x="${r2((x0 + x1) / 2 * S)}" y="${r2((yd + 0.3) * S)}">${(x1 - x0).toFixed(2)} m</text>`);
        parts.push(`<text class="dim-t" x="${r2((xd + 0.3) * S)}" y="${r2((y0 + y1) / 2 * S)}" transform="rotate(-90 ${r2((xd + 0.3) * S)} ${r2((y0 + y1) / 2 * S)})">${(y1 - y0).toFixed(2)} m</text>`);
        parts.push('</g>');
    }

    parts.push('</svg>');
    return parts.join('');
}

/** Render every level: returns [{ level, title, svg }]. */
export function renderAllLevels(lib, solution, options = {}) {
    const house = solution?.house ?? solution;
    const levels = house.grid_shape?.[2] ?? 1 + Math.max(0, ...house.modules.map((m) => m.position[2]));
    const result = [];
    for (let l = 0; l < levels; l++) {
        if (!house.modules.some((m) => m.position[2] === l)) continue;
        const title = options.title === undefined ? (LEVEL_NAMES[l] ?? `Level ${l}`) : options.title;
        result.push({ level: l, title, svg: renderPlan(lib, house, l, { ...options, title }) });
    }
    return result;
}
