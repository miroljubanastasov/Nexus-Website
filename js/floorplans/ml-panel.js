/**
 * Floor-plan page controller for the in-browser workflow:
 * - live feasibility estimate from the Nexus_Mind model, updated as the form changes
 * - the closest solved layout from the training library is picked on every change
 *   and drawn with the plan renderer (site or building view, one floor at a time)
 *
 * With ?solver=api the layout comes from the Python solver service instead
 * (localhost:8080); the feasibility estimate still runs in the browser.
 */
import { loadModel, MODULE_AREA } from '../ml/feasibility.js';
import { showLevel } from './get_flooplan.js';

const $ = (id) => document.getElementById(id);
const SOLVER_MODE = new URLSearchParams(location.search).get('solver') || window.NEXUS_SOLVER || 'ml';
const FLOOR_NAMES = ['Ground', 'First', 'Second', 'Third'];
const NOT_INDOOR = ['NX_ELE_EPO_00', 'NX_ELE_GAR_00', 'NX_ELE_STA_00', 'NX_ELE_CON_00'];

export async function initMlPanel(configManager) {
    wireFormControls(configManager);

    let model;
    try {
        model = await loadModel('assets/ml/configurator_data.json');
    } catch (err) {
        console.error(err);
        setBadge('Model unavailable', 'secondary');
        $('feasNotes').innerHTML = '<li>The feasibility model could not be loaded. Check that assets/ml/configurator_data.json is served with the page.</li>';
        return null;
    }

    const state = { exIndex: 0, ranked: null };
    const assess = () => model.assess(configManager.generateBriefJson(), configManager.generatePlotJson());

    /* ---------- feasibility ---------- */
    function renderFeasibility() {
        const a = assess();
        const tone = { good: 'success', warn: 'warning', bad: 'danger' }[a.verdict];
        setBadge({ good: 'Likely buildable', warn: 'Uncertain', bad: 'Unlikely to solve' }[a.verdict], tone);
        const pct = Math.min(99, Math.max(1, Math.round(a.p * 100)));
        $('feasProb').textContent = `${pct}%`;
        const bar = $('feasBar');
        bar.style.width = `${(a.p * 100).toFixed(1)}%`;
        bar.className = `progress-bar bg-${tone}`;
        bar.parentElement.setAttribute('aria-valuenow', String(pct));

        const indoor = a.modules.filter((id) => !NOT_INDOOR.includes(id)).length;
        $('statModules').textContent = a.modules.length;
        $('statArea').textContent = `${Math.round(indoor * MODULE_AREA)} m²`;
        $('statGrid').textContent = `${a.f.rows} × ${a.f.cols}`;
        const slack = $('statSlack');
        slack.textContent = a.f.slack;
        slack.classList.toggle('text-danger', a.f.slack < 0);
        $('feasNotes').innerHTML = a.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
        return a;
    }

    /* ---------- layout bar ---------- */
    function renderLayoutBar(a, pick) {
        const top = a.ranked.top;
        const ex = model.library[pick.idx];
        $('exampleTitle').textContent = `Layout ${state.exIndex + 1} of ${top.length}`;
        $('exampleCaption').textContent =
            `Closest of ${model.size.toLocaleString()} solver layouts · solved for a ${ex.s[0]} × ${ex.s[1]} m plot, north ${Math.round(pick.mirror ? (360 - ex.s[3]) % 360 : ex.s[3])}°${pick.mirror ? ' (mirrored east–west)' : ''}`;
        const diffs = model.differences(a.ranked.want, pick.idx, a.brief);
        if (!pick.fits) diffs.unshift({ kind: 'missing', text: `footprint ${ex.box.h} × ${ex.box.w} is larger than the ${a.f.rows} × ${a.f.cols} grid` });
        $('exampleDiff').innerHTML = diffs.length
            ? diffs.map((d) => `<span class="badge rounded-pill ${d.kind === 'missing' ? 'text-bg-warning' : 'text-bg-light border'}">${escapeHtml(d.text)}</span>`).join('')
            : '<span class="badge rounded-pill text-bg-success"><i class="fas fa-check me-1"></i>All rooms in your brief</span>';
        $('prevExampleBtn').disabled = top.length < 2;
        $('nextExampleBtn').disabled = top.length < 2;
    }

    function renderLayoutStats(solution) {
        const s = solution?.house?.summary;
        $('layoutStats').innerHTML = s ? [
            ['Floor area', `${Math.round(s.GFA)} m²`],
            ['Levels', s.num_of_levels],
            ['Bedrooms', s.bedrooms],
            ['Bathrooms', s.bathrooms],
        ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('') : '';
    }

    function renderFloorPicker(solution) {
        const mods = solution?.house?.modules ?? [];
        const levels = [...new Set(mods.map((m) => m.position?.[2] ?? 0))].sort((x, y) => x - y);
        const picker = $('floorPicker');
        picker.innerHTML = levels.map((l, i) =>
            `<button type="button" class="btn btn-outline-secondary" data-index="${i}" aria-pressed="false">${FLOOR_NAMES[l] ?? `Level ${l}`}</button>`).join('');
        picker.hidden = levels.length < 2;
        syncFloorPicker();
    }

    function syncFloorPicker() {
        const shown = document.querySelector('#svgContainer svg.nx-plan')?.dataset.level;
        $('floorPicker').querySelectorAll('button').forEach((b) => {
            const on = b.textContent === (FLOOR_NAMES[+shown] ?? `Level ${shown}`);
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', String(on));
        });
    }

    $('floorPicker').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-index]');
        if (b) showLevel(+b.dataset.index);
    });
    new MutationObserver(syncFloorPicker).observe($('svgContainer'), { childList: true, subtree: true });

    /* ---------- solving ---------- */
    async function mlSolve() {
        const a = assess();
        state.ranked = a;
        if (!a.ranked.top.length) return { success: false, error: 'No solved layouts in the library.' };
        state.exIndex = Math.min(state.exIndex, a.ranked.top.length - 1);
        const pick = a.ranked.top[state.exIndex];
        renderLayoutBar(a, pick);
        return { success: true, solution: model.toSolution(pick.idx, pick.mirror) };
    }

    async function showExample(step) {
        if (!state.ranked) return;
        const n = state.ranked.ranked.top.length;
        state.exIndex = (state.exIndex + step + n) % n;
        const pick = state.ranked.ranked.top[state.exIndex];
        configManager.currentSolution = model.toSolution(pick.idx, pick.mirror);
        renderLayoutBar(state.ranked, pick);
        await configManager.generateFloorPlanFromSolution();
    }

    if (SOLVER_MODE === 'ml') {
        configManager.solver = async () => { state.exIndex = 0; return mlSolve(); };
        configManager.autoGenerate = true;
    } else {
        $('exampleTitle').textContent = 'Solver service';
        $('exampleCaption').textContent = 'Layouts come from the solver API on localhost:8080.';
        $('prevExampleBtn').hidden = true;
        $('nextExampleBtn').hidden = true;
    }

    $('prevExampleBtn').addEventListener('click', () => showExample(-1));
    $('nextExampleBtn').addEventListener('click', () => showExample(1));

    window.addEventListener('nexus:projectImported', (e) => {
        state.ranked = null;
        $('exampleTitle').textContent = 'Imported project';
        $('exampleCaption').textContent = e.detail?.name ?? '';
        $('exampleDiff').innerHTML = '<span class="badge rounded-pill text-bg-light border">Change the brief or site to pick a new layout</span>';
        $('prevExampleBtn').disabled = true;
        $('nextExampleBtn').disabled = true;
    });

    // Redraw whenever a new solution has been drawn (solve, browse, project import)
    window.addEventListener('nexus:svgDone', () => {
        renderLayoutStats(configManager.currentSolution);
        renderFloorPicker(configManager.currentSolution);
        $('exportProjectBtn').disabled = !configManager.currentSolution;
    });

    /* ---------- live update ---------- */
    let timer = null, busy = false, pending = false;
    async function refreshLayout() {
        if (busy) { pending = true; return; }
        busy = true;
        try { await configManager.solveHouse(); } finally {
            busy = false;
            if (pending) { pending = false; refreshLayout(); }
        }
    }
    const schedule = (e) => {
        if (e?.target?.name === 'planView') return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            renderFeasibility();
            if (configManager.suppressNextLiveSolve) { configManager.suppressNextLiveSolve = false; return; }
            if (SOLVER_MODE === 'ml') refreshLayout();
        }, SOLVER_MODE === 'ml' ? 150 : 600);
    };
    configManager.form?.addEventListener('input', schedule);
    configManager.form?.addEventListener('change', schedule);
    window.addEventListener('nexus:configLoaded', schedule);

    document.querySelectorAll('input[name="planView"]').forEach((r) => r.addEventListener('change', () => {
        window.NEXUS_PLAN_VIEW = r.value;
        if (configManager.currentSolution) configManager.generateFloorPlanFromSolution();
    }));

    renderFeasibility();
    if (SOLVER_MODE === 'ml') refreshLayout();
    return { model, refresh: renderFeasibility };
}

/* ---------- form controls that stand in for plain inputs ---------- */
function wireFormControls(configManager) {
    // Segmented buttons write to the hidden inputs config-manager reads
    document.querySelectorAll('.seg[data-target]').forEach((group) => {
        const target = $(group.dataset.target);
        group.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => {
            target.value = r.value;
            applyLevelRules();
        }));
    });

    const north = $('northAngle');
    const syncNorth = () => {
        $('northOut').textContent = `${north.value}°`;
        $('miniNorth').setAttribute('transform', `rotate(${north.value})`);
    };
    north.addEventListener('input', syncNorth);

    // Double-height rooms only exist with an upper level
    function applyLevelRules() {
        const single = +$('maxLevels').value <= 1;
        ['doubleHeightLivingRoom', 'doubleHeightDiningRoom'].forEach((id) => { $(id).disabled = single; });
        $('doubleHeightHint').hidden = !single;
    }

    // Imported projects set the hidden inputs directly: reflect them in the controls
    window.addEventListener('nexus:configLoaded', () => {
        document.querySelectorAll('.seg[data-target]').forEach((group) => {
            const v = String(Math.round(+$(group.dataset.target).value));
            group.querySelectorAll('input[type=radio]').forEach((r) => { r.checked = r.value === v; });
        });
        syncNorth();
        applyLevelRules();
    });

    syncNorth();
    applyLevelRules();
}

function setBadge(text, tone) {
    const badge = $('feasState');
    badge.textContent = text;
    badge.className = `badge rounded-pill text-bg-${tone}`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
