/**
 * Nexus feasibility model + solved-layout library, running in the browser.
 *
 * Data: assets/ml/configurator_data.json, exported by Nexus_Mind
 *   PYTHONPATH=src python -m mind.training.export_configurator --out <this repo>/assets/ml/configurator_data.json
 * It holds:
 *   features  feature names, in model order
 *   model     HistGradientBoosting trees as plain arrays (baseline + trees)
 *   types     module type ids/names, indexed by the library
 *   library   solved layouts: b = brief, s = site, g = grid shape,
 *             m = flat [typeIndex, row, col, level, rotation] * n,
 *             h | house = (optional) full post-processed house JSON (flip, partitions)
 *
 * The feature and brief logic mirrors mind.training.train_feasibility.featurize
 * and Brief.load_modules (ported from Nexus_Mind docs/configurator). Keep the
 * two in sync when the model is retrained with new features.
 */

export const GRID = 3.75;
export const MODULE_AREA = GRID * GRID;

export const BRIEF_OPTIONS = [
    'Guest', 'Parents', 'Office', 'Library', 'Spa', 'LargeLivingRoom',
    'DoubleHeightLivingRoom', 'DoubleHeightDiningRoom', 'CompactKitchen', 'Garden',
];

// Training domain (residential v2): inputs outside it get a warning.
export const DOMAIN = { w: [12, 30], d: [20, 45], area: [300, 1200], sbS: [3, 6], sbN: [3, 10], sbSide: [1.5, 3], grz: [0.25, 0.55] };

const OUTDOOR = new Set(['NX_ELE_EPO_00', 'NX_ELE_GAR_00']);
const IGNORE = new Set(['NX_ELE_STA_00', 'NX_ELE_CON_00']);
const BATHS = new Set(['NX_ELE_MBA_00', 'NX_ELE_PBA_00', 'NX_ELE_SBA_00']);
const BEDS = new Set(['NX_ELE_MBR_00', 'NX_ELE_PBR_00', 'NX_ELE_SBR_00', 'NX_ELE_GBR_00']);

/* ------------------------------------------------------------------ */

export async function loadModel(url = 'assets/ml/configurator_data.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Model data ${url}: HTTP ${res.status}`);
    return new FeasibilityModel(await res.json());
}

/** Website PLOT json (config-manager.generatePlotJson) -> model site. */
export function siteFromPlot(plot) {
    const [w, d] = plot.building_site_size ?? [0, 0];
    const sb = { S: 0, N: 0, E: 0, W: 0, ...(plot.setbacks ?? {}) };
    const footprint = Math.max(1, plot.max_modules_footprint || Math.floor(0.4 * w * d / MODULE_AREA));
    return {
        w, d, sb, footprint,
        levels: Math.max(1, plot.max_levels || 1),
        north: plot.north_angle ?? 0,
        access: { N: false, S: false, E: false, W: false, ...(plot.access ?? {}) },
        nd: { N: 0, S: 0, E: 0, W: 0, ...(plot.neighbours_distance ?? {}) },
        grz: w * d > 0 ? footprint * MODULE_AREA / (w * d) : 0,
    };
}

/** Module list required by a brief (mirrors Brief.load_modules + House stairs). */
export function briefModules(b, levels) {
    const m = ['NX_ELE_ENT_00', 'NX_ELE_EPO_00', 'NX_ELE_LIV_00'];
    if (b.DoubleHeightLivingRoom) m.push('NX_ELE_CON_00');
    if (b.Garden) m.push('NX_ELE_GAR_00');
    if (b.CompactKitchen) m.push('NX_ELE_KIT_01');
    else { m.push('NX_ELE_DIN_00', 'NX_ELE_KIT_00'); if (b.DoubleHeightDiningRoom) m.push('NX_ELE_CON_00'); }
    m.push('NX_ELE_MBR_00', 'NX_ELE_MBA_00', 'NX_ELE_TRA_00');
    if (b.Office) m.push('NX_ELE_OFF_00');
    if (b.Library) m.push('NX_ELE_LIB_00');
    if (b.Spa) m.push('NX_ELE_SPA_00');
    if (b.Parents) m.push('NX_ELE_PBR_00', 'NX_ELE_PBA_00');
    for (let i = 0; i < b.Bedrooms; i++) m.push('NX_ELE_SBR_00');
    if (b.Guest) m.push('NX_ELE_GBR_00');
    const beds = b.Bedrooms + (b.Guest ? 1 : 0);
    for (let i = 0; i < Math.ceil(beds / 2); i++) m.push('NX_ELE_SBA_00');
    if (levels > 1) for (let i = 0; i < levels; i++) m.push('NX_ELE_STA_00');
    return m;
}

/** Normalise a brief: single-storey sites cannot have double-height rooms. */
export function normaliseBrief(brief, levels) {
    const b = { Bedrooms: Math.max(0, Math.round(+brief.Bedrooms || 0)) };
    BRIEF_OPTIONS.forEach((k) => { b[k] = !!brief[k]; });
    if (levels <= 1) { b.DoubleHeightLivingRoom = false; b.DoubleHeightDiningRoom = false; }
    return b;
}

/** Feature vector (mirrors train_feasibility.featurize with pattern = full). */
export function features(brief, site, nMods) {
    const bw = site.w - site.sb.W - site.sb.E;
    const bd = site.d - site.sb.N - site.sb.S;
    const rows = Math.max(0, Math.floor(bd / GRID));
    const cols = Math.max(0, Math.floor(bw / GRID));
    const nCells = rows * cols;
    const capacity = Math.min(site.footprint, nCells) * site.levels;
    const rad = site.north * Math.PI / 180;
    const f = {
        bedrooms: brief.Bedrooms, site_w: site.w, site_d: site.d, buildable_w: bw, buildable_d: bd,
        rows, cols, n_cells: nCells, max_levels: site.levels, max_footprint: site.footprint,
        north_sin: Math.sin(rad), north_cos: Math.cos(rad), capacity,
        n_modules: nMods, slack: capacity - nMods,
        pat_full: 1, pat_bar2: 0, pat_bar2_ns: 0, pat_courtyard: 0, pat_double_bar: 0, pat_l_shape2: 0,
    };
    BRIEF_OPTIONS.forEach((k) => { f[`b_${k}`] = brief[k] ? 1 : 0; });
    ['N', 'S', 'E', 'W'].forEach((k) => { f[`access_${k}`] = site.access[k] ? 1 : 0; f[`nd_${k}`] = site.nd[k]; });
    return f;
}

function countMap(list) {
    const c = {};
    list.forEach((id) => { if (!IGNORE.has(id)) c[id] = (c[id] || 0) + 1; });
    return c;
}

/* ------------------------------------------------------------------ */

export class FeasibilityModel {
    constructor(data) {
        this.data = data;
        this.typeIds = data.types.map((t) => t.id);
        this.typeName = Object.fromEntries(data.types.map((t) => [t.id, t.name]));
        this.typeName.NX_ELE_CON_00 ??= 'Connecting Void';
        this.typeName.NX_ELE_STA_00 ??= 'Stairs';
        this.library = data.library.map((e) => this.#indexExample(e));
    }

    get size() { return this.library.length; }

    #indexExample(e) {
        const T = this.typeIds;
        const counts = {};
        const at = {};
        const voids = new Set();
        let maxL = 0, r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
        for (let i = 0; i < e.m.length; i += 5) {
            const id = T[e.m[i]], r = e.m[i + 1], c = e.m[i + 2], l = e.m[i + 3];
            maxL = Math.max(maxL, l);
            if (!IGNORE.has(id)) counts[id] = (counts[id] || 0) + 1;
            at[`${id}@${l}`] = `${r},${c}`;
            if (id === 'NX_ELE_CON_00' && l === 1) voids.add(`${r},${c}`);
            r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
        }
        return {
            ...e, counts, usedLevels: maxL + 1,
            dhLiving: voids.has(at['NX_ELE_LIV_00@0']), dhDining: voids.has(at['NX_ELE_DIN_00@0']),
            box: { r0, c0, h: r1 - r0 + 1, w: c1 - c0 + 1 },
        };
    }

    predictFeatures(f) {
        const x = this.data.features.map((n) => f[n] ?? 0);
        let raw = this.data.model.baseline;
        for (const t of this.data.model.trees) {
            let i = 0;
            while (!t.leaf[i]) i = x[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i];
            raw += t.v[i];
        }
        return 1 / (1 + Math.exp(-raw));
    }

    /**
     * Full assessment of a website brief + plot.
     * @returns {{ p, verdict, brief, site, modules, f, notes, outsideDomain, ranked }}
     */
    assess(briefIn, plot, { top = 8 } = {}) {
        const site = siteFromPlot(plot);
        const brief = normaliseBrief(briefIn, site.levels);
        const modules = briefModules(brief, site.levels);
        const f = features(brief, site, modules.length);
        const p = this.predictFeatures(f);
        const verdict = p >= 0.7 ? 'good' : p >= 0.4 ? 'warn' : 'bad';

        const notes = [];
        if (f.rows === 0 || f.cols === 0) notes.push('The setbacks leave no room for a 3.75 m module.');
        else if (f.slack < 0) notes.push(`The house needs ${-f.slack} more cells than the plot allows. Add a level, raise the footprint or reduce the brief.`);
        else notes.push(`${f.slack} spare cells after placing all ${modules.length} modules.`);
        if (f.cols > 0 && f.cols <= 2) notes.push('The grid is only 2 modules wide. Narrow plots often fail on facade and stair rules, and the model tends to be optimistic here.');
        if (brief.CompactKitchen) notes.push('A compact kitchen fits fewer configurations than separate kitchen and dining.');

        const outside = [];
        if (site.w < DOMAIN.w[0] || site.w > DOMAIN.w[1]) outside.push('plot width');
        if (site.d < DOMAIN.d[0] || site.d > DOMAIN.d[1]) outside.push('plot depth');
        const area = site.w * site.d;
        if (area < DOMAIN.area[0] || area > DOMAIN.area[1]) outside.push('plot area');
        if (site.grz < DOMAIN.grz[0] || site.grz > DOMAIN.grz[1]) outside.push('coverage');
        const sb = site.sb;
        if (sb.S < DOMAIN.sbS[0] || sb.S > DOMAIN.sbS[1] || sb.N < DOMAIN.sbN[0] || sb.N > DOMAIN.sbN[1]
            || sb.E < DOMAIN.sbSide[0] || sb.E > DOMAIN.sbSide[1] || sb.W < DOMAIN.sbSide[0] || sb.W > DOMAIN.sbSide[1]) outside.push('setbacks');
        if (outside.length) notes.push(`Outside the training range (${outside.join(', ')}): treat the estimate with caution.`);

        return { p, verdict, brief, site, modules, f, notes, outsideDomain: outside, ranked: this.rank(brief, site, f.rows, f.cols, top) };
    }

    /** Closest solved layouts for a brief and grid. */
    rank(brief, site, rows, cols, top = 8) {
        const want = countMap(briefModules(brief, site.levels));
        const scored = this.library.map((e, idx) => {
            let diff = 0;
            const keys = new Set([...Object.keys(want), ...Object.keys(e.counts)]);
            keys.forEach((k) => { diff += Math.abs((want[k] || 0) - (e.counts[k] || 0)); });
            const dh = Number(!!brief.DoubleHeightLivingRoom !== e.dhLiving)
                + Number(!!(brief.DoubleHeightDiningRoom && !brief.CompactKitchen) !== e.dhDining);
            const over = Math.max(0, e.box.h - rows) + Math.max(0, e.box.w - cols);
            const score = diff * 10 + dh * 12 + over * 60
                + Math.abs(e.usedLevels - Math.min(site.levels, e.s[2])) * 2
                + Math.abs(e.s[2] - site.levels) * 2 + 0.3 * ((rows - e.box.h) + (cols - e.box.w));
            return { idx, score, diff, fits: over === 0 };
        });
        scored.sort((a, b) => a.score - b.score);
        return { want, top: scored.slice(0, top) };
    }

    /** Differences between the brief and an example, as short labelled items. */
    differences(want, idx, brief) {
        const ex = this.library[idx];
        const name = (k) => (this.typeName[k] || k).replace('Dinning', 'Dining');
        const out = [];
        const keys = new Set([...Object.keys(want), ...Object.keys(ex.counts)]);
        keys.forEach((k) => {
            const d = (want[k] || 0) - (ex.counts[k] || 0);
            if (d > 0) out.push({ kind: 'missing', text: `missing ${d > 1 ? `${d}× ` : ''}${name(k)}` });
            if (d < 0) out.push({ kind: 'extra', text: `extra ${-d > 1 ? `${-d}× ` : ''}${name(k)}` });
        });
        if (!!brief.DoubleHeightLivingRoom !== ex.dhLiving) out.push({ kind: ex.dhLiving ? 'extra' : 'missing', text: `double-height living ${ex.dhLiving ? 'in example only' : 'not in example'}` });
        const wantDin = !!(brief.DoubleHeightDiningRoom && !brief.CompactKitchen);
        if (wantDin !== ex.dhDining) out.push({ kind: ex.dhDining ? 'extra' : 'missing', text: `double-height dining ${ex.dhDining ? 'in example only' : 'not in example'}` });
        return out;
    }

    /**
     * Solver-style solution for a library example: { house: { grid_shape, grid_size, modules, partitions, summary } }.
     * Uses the stored post-processed house (flip, partitions) when the export includes it.
     */
    toSolution(idx) {
        const ex = this.library[idx];
        let house;
        const full = ex.h ?? ex.house;   // post-processed house_to_json, when exported
        if (full) {
            house = structuredClone(full.house ?? full);
        } else {
            const modules = [];
            for (let i = 0; i < ex.m.length; i += 5) {
                const [ti, row, col, level, rotation] = ex.m.slice(i, i + 5);
                const type = this.typeIds[ti];
                modules.push({
                    name: (this.typeName[type] || type), type, position: [row, col, level], rotation, flip: false,
                    is_indoor: !OUTDOOR.has(type), open_to_sky: type === 'NX_ELE_GAR_00',
                });
            }
            house = { grid_shape: [ex.g[0], ex.g[1], ex.usedLevels], grid_size: GRID, modules, partitions: [] };
        }
        const mods = house.modules;
        const indoor = mods.filter((m) => m.is_indoor !== false && !OUTDOOR.has(m.type) && m.type !== 'NX_ELE_CON_00');
        house.summary ??= {
            GFA: indoor.length * MODULE_AREA,
            num_of_levels: 1 + Math.max(0, ...mods.map((m) => m.position[2])),
            total_modules: mods.length,
            bedrooms: mods.filter((m) => BEDS.has(m.type)).length,
            bathrooms: mods.filter((m) => BATHS.has(m.type)).length,
        };
        return {
            house,
            source: { kind: 'ml-library', index: idx, originalSite: { w: ex.s[0], d: ex.s[1], levels: ex.s[2] }, hasPostProcess: !!(ex.h ?? ex.house) },
        };
    }
}
