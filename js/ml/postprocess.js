/**
 * JS port of Nexus_Mind House.post_process_solution() (src/mind/core/element/house.py,
 * partition.py, utils/arrayUtils.normalize_module_dict) for layouts produced in the browser.
 *
 * Input: a placed layout in solver terms
 *   modules: [{ id, type, position: [row, col, level], rotation, primary_facade, all_facade,
 *               neighbours: {N,E,S,W: module id | null}, void_over? }]
 *   treeEdges: [[a, b], ...] connectivity spanning-tree edges (module ids), in solver order
 *   config: docs/samples/module_config.json (MODULES flags, reward and adjacency pairs)
 * Output: { modules: per-module details, house: house_to_json-shaped object }
 *
 * tests/postprocess.test.mjs checks it against Nexus_Mind docs/samples/post_process_fixture.json.
 */

const DIRS = ['N', 'E', 'S', 'W'];
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DI = { N: 0, E: 1, S: 2, W: 3 };
export const EdgeContext = { PRIMARY_FACADE: 0, SECONDARY_FACADE: 1, CONNECTED_TO_MODULE: 2, SECONDARY_TO_MODULE: 3, INTERNAL_EDGE: 4 };
const GRID_SIZE = 3.75;
const BATHS = ['NX_ELE_SBA_00', 'NX_ELE_MBA_00', 'NX_ELE_PBA_00'];
const BEDS = ['NX_ELE_SBR_00', 'NX_ELE_MBR_00', 'NX_ELE_PBR_00', 'NX_ELE_GBR_00'];

/** arrayUtils.normalize_module_dict: N,E,S,W values, reversed when flipped, rotated left by rot. */
export function normalizeModuleDict(d, rot, flip = false) {
    let v = DIRS.map((k) => d[k]);
    if (flip) v = v.reverse();
    const k = ((rot % 4) + 4) % 4;
    v = [...v.slice(k), ...v.slice(0, k)];   // deque.rotate(-rot)
    return Object.fromEntries(DIRS.map((dir, i) => [dir, v[i]]));
}

/** Type-level value tables (symmetric): reward and adjacency regulation. */
export function typeTables(config) {
    const reward = new Map(), adjacency = new Map();
    for (const [a, b, v] of config.reward ?? []) { reward.set(`${a}|${b}`, v); reward.set(`${b}|${a}`, v); }
    for (const [a, b, v] of config.adjacency ?? []) { adjacency.set(`${a}|${b}`, v); adjacency.set(`${b}|${a}`, v); }
    return { reward, adjacency };
}

const BEDROOM_BLOCK = new Set(['NX_ELE_SBR_00', 'NX_ELE_GBR_00']);

/**
 * Module-level pairs as Brief.load_modules + Brief.add_stairs build them (ids in brief order):
 *  - stairs pair with every non-stair module, by type;
 *  - single and guest bedrooms pair only with their own shared bathroom (every 2 bedrooms, in
 *    id order, share one; bathrooms in id order) and with stairs;
 *  - shared bathrooms pair with their bedrooms and with every non-bedroom, non-bathroom module;
 *  - all other modules pair with each other by type.
 * Returns { allowed: Set("a|b"), reward: Map("a|b" -> v), mandatory: Set("a|b") } over module ids.
 */
export function modulePairs(modules, config) {
    const { reward, adjacency } = typeTables(config);
    const ids = [...modules].sort((a, b) => a.id - b.id);
    const beds = ids.filter((m) => BEDROOM_BLOCK.has(m.type));
    const baths = ids.filter((m) => m.type === 'NX_ELE_SBA_00');
    const ownBath = new Map(beds.map((b, i) => [b.id, baths[Math.floor(i / 2)]?.id]));
    const isStair = (m) => m.type.startsWith('NX_ELE_STA_');
    const typeKey = (m) => (isStair(m) ? 'NX_ELE_STA_00' : m.type.startsWith('NX_ELE_CON_') ? 'NX_ELE_CON_00' : m.type);
    const canPair = (a, b) => {
        if (a.id === b.id) return false;
        if (isStair(a) || isStair(b)) return !(isStair(a) && isStair(b));
        const aBed = BEDROOM_BLOCK.has(a.type), bBed = BEDROOM_BLOCK.has(b.type);
        const aBath = a.type === 'NX_ELE_SBA_00', bBath = b.type === 'NX_ELE_SBA_00';
        if (aBed || bBed) {
            if (aBed && bBath) return ownBath.get(a.id) === b.id;
            if (bBed && aBath) return ownBath.get(b.id) === a.id;
            return false;
        }
        if (aBath && bBath) return false;
        return true;
    };
    const allowed = new Set(), rw = new Map(), mandatory = new Set();
    for (const a of ids) for (const b of ids) {
        if (!canPair(a, b)) continue;
        const k = `${typeKey(a)}|${typeKey(b)}`;
        const r = reward.get(k) ?? 0, adj = adjacency.get(k) ?? 0;
        if (r > 0 || adj > 0) allowed.add(`${a.id}|${b.id}`);
        if (r > 0) rw.set(`${a.id}|${b.id}`, r);
        if (adj > 0) mandatory.add(`${a.id}|${b.id}`);
    }
    return { allowed, reward: rw, mandatory };
}

export function postProcess({ modules, treeEdges, config, gridShape, numLevels }) {
    const flags = config.modules;
    const { allowed } = modulePairs(modules, config);
    const levels = numLevels ?? 1 + Math.max(0, ...modules.map((m) => m.position[2]));

    // working copies
    const mods = modules.map((m) => ({
        ...m,
        typeFinal: m.type,
        primary_facade: { N: false, E: false, S: false, W: false, ...(m.primary_facade ?? {}) },
        all_facade: { N: false, E: false, S: false, W: false, ...(m.all_facade ?? {}) },
        neighbours: { N: null, E: null, S: null, W: null, ...(m.neighbours ?? {}) },
        all_neighbours: { N: null, E: null, S: null, W: null },
        secondary_neighbours: { N: null, E: null, S: null, W: null },
        edge_context: { N: null, E: null, S: null, W: null },
        passage: { N: null, E: null, S: null, W: null },
        norm_passage: null,
        access_points: [],
        flip: false,
    }));
    const byId = new Map(mods.map((m) => [m.id, m]));
    const f = (m) => flags[m.type] ?? flags[m.type.replace(/_0\d$/, '_00')] ?? {};

    // tree degree (for voids)
    const degree = new Map();
    for (const [a, b] of treeEdges) { degree.set(a, (degree.get(a) ?? 0) + 1); degree.set(b, (degree.get(b) ?? 0) + 1); }

    // process_stairs / process_voids: drawing relabels
    for (const m of mods) {
        const lvl = m.position[2];
        if (m.type === 'NX_ELE_STA_00' && lvl > 0) m.typeFinal = lvl < levels - 1 ? 'NX_ELE_STA_02' : 'NX_ELE_STA_01';
        if (m.type === 'NX_ELE_CON_00' && (degree.get(m.id) ?? 0) === 1) m.typeFinal = 'NX_ELE_CON_01';
    }

    // calculate_area: indoor modules, stairs once (ground floor)
    let gfa = 0;
    for (const m of mods) {
        if (!f(m).INDOOR) continue;
        if (m.typeFinal.startsWith('NX_ELE_STA') && m.position[2] !== 0) continue;
        gfa += GRID_SIZE * GRID_SIZE;
    }

    // build_all_neighbours: every grid-adjacent module on the same level; secondary = allowed pair
    const at = new Map();
    for (const m of mods) at.set(`${m.position[0]},${m.position[1]},${m.position[2]}`, m);
    const step = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] };
    for (const m of mods) {
        const [r, c, l] = m.position;
        for (const dir of DIRS) {
            const [dr, dc] = step[dir];
            const b = at.get(`${r + dr},${c + dc},${l}`);
            if (!b) continue;
            m.all_neighbours[dir] = b.id; b.all_neighbours[OPP[dir]] = m.id;
            if (allowed.has(`${m.id}|${b.id}`)) {
                m.secondary_neighbours[dir] = b.id; b.secondary_neighbours[OPP[dir]] = m.id;
            }
        }
    }

    // build_edge_context
    for (const m of mods) {
        for (const dir of DIRS) {
            m.edge_context[dir] = m.primary_facade[dir] ? EdgeContext.PRIMARY_FACADE
                : m.all_facade[dir] ? EdgeContext.SECONDARY_FACADE
                : m.neighbours[dir] != null ? EdgeContext.CONNECTED_TO_MODULE
                : m.secondary_neighbours[dir] != null ? EdgeContext.SECONDARY_TO_MODULE
                : EdgeContext.INTERNAL_EDGE;
        }
    }

    // build_passage over tree edges
    const P0 = [[0, 2], [0, 3], [3, 2], [3, 3]], P1 = [[0, 1], [1, 1], [1, 2]];
    for (const [a, b] of treeEdges) {
        const A = byId.get(a), B = byId.get(b);
        for (const dir of DIRS) {
            if (A.neighbours[dir] !== B.id) continue;
            const sh = (pairs) => pairs.map(([x, y]) => `${(x + DI[dir]) % 4},${(y + DI[dir]) % 4}`);
            const key = `${A.rotation},${B.rotation}`;
            if (sh(P0).includes(key)) { A.passage[dir] = 0; B.passage[OPP[dir]] = 1; }
            else if (sh(P1).includes(key)) { A.passage[dir] = 1; B.passage[OPP[dir]] = 0; }
        }
    }

    // normalised passage -> access points (flip is still false here, as in Python)
    for (const m of mods) {
        m.norm_passage = normalizeModuleDict(m.passage, m.rotation, m.flip);
        if (m.norm_passage.W === 1 || m.norm_passage.N === 0) m.access_points.push(0);
        if (m.norm_passage.N === 1 || m.norm_passage.E === 0) m.access_points.push(1);
    }

    // module_flip
    for (const m of mods) {
        const npf = normalizeModuleDict(m.primary_facade, m.rotation);
        if (npf.W) m.flip = true;
        else if (npf.S && m.access_points.length === 1 && m.access_points[0] === 1) m.flip = true;
    }

    // build_partitions
    const partitions = [];
    const visited = new Set();
    const level = (m) => (f(m).PART ?? 2);
    for (const A of mods) {
        for (const dir of DIRS) {
            const ec = A.edge_context[dir];
            if (![EdgeContext.CONNECTED_TO_MODULE, EdgeContext.SECONDARY_TO_MODULE, EdgeContext.INTERNAL_EDGE].includes(ec)) continue;
            const bId = A.all_neighbours[dir];
            if (bId == null) continue;
            const B = byId.get(bId);
            const key = `${Math.min(A.id, B.id)},${Math.max(A.id, B.id)}`;
            if (visited.has(key)) continue;
            visited.add(key);
            const p = setPartition(A, B, dir, level, f);
            if (p) partitions.push(p);
        }
    }

    const summary = {
        GFA: gfa,
        num_of_levels: levels,
        total_modules: mods.length,
        bathrooms: mods.filter((m) => BATHS.includes(m.typeFinal)).length,
        bedrooms: mods.filter((m) => BEDS.includes(m.typeFinal)).length,
    };

    const house = {
        grid_shape: gridShape ? [gridShape[0], gridShape[1], levels] : undefined,
        grid_size: GRID_SIZE,
        modules: mods.map((m) => ({
            id: m.id, name: m.name ?? f(m).NAME ?? m.type, type: m.typeFinal, position: m.position,
            rotation: m.rotation, flip: m.flip, is_indoor: !!f(m).INDOOR, open_to_sky: !!f(m).OTS,
            primary_facade: m.primary_facade, all_facade: m.all_facade, void_over: m.void_over ?? null,
        })),
        partitions,
        summary,
    };
    return { modules: mods, house };
}

/** partition.Partition.set_partition */
function setPartition(a, b, dir, level, f) {
    let from = a, to = b, direction = dir;
    if (!(level(a) <= level(b))) { from = b; to = a; direction = OPP[dir]; }
    const p = {
        type: null, cell: [from.position[0], from.position[1]], level: from.position[2],
        rotation: DI[direction], flip: false, from_module: from.id, to_module: to.id,
    };
    if (!f(from).INDOOR) return null;
    const ec = from.edge_context[direction];
    const same = level(from) === level(to);
    if (ec === EdgeContext.CONNECTED_TO_MODULE) {
        if (same) return null;
        if (level(from) === 0) p.type = 'NX_ELE_PAR_INS_00';
        else if (level(from) === 1) p.type = 'NX_ELE_PAR_SHL_01';
    } else if (ec === EdgeContext.SECONDARY_TO_MODULE) {
        if (same) return null;
        if (level(from) === 0) p.type = 'NX_ELE_PAR_INS_01';
        if (level(from) === 1) p.type = 'NX_ELE_PAR_SHL_01';
    } else if (ec === EdgeContext.INTERNAL_EDGE) {
        if (same) return null;
        p.type = 'NX_ELE_PAR_INS_01';
    }
    if (from.passage[direction] === 1) p.flip = true;
    return p.type ? p : null;
}
