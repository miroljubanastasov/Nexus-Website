/**
 * Connects the Nexus_Mind feasibility model to the floor-plan page:
 * - a live feasibility estimate in the side panel, updated as the form changes
 * - "Find Layout": the closest solved layout from the training library becomes the
 *   current solution and is drawn with the in-browser plan renderer
 *
 * The solver API path stays available with ?solver=api (needs the Python solver
 * service on localhost:8080).
 */
import { loadModel, MODULE_AREA } from '../ml/feasibility.js';

const $ = (id) => document.getElementById(id);
const SOLVER_MODE = new URLSearchParams(location.search).get('solver') || window.NEXUS_SOLVER || 'ml';

export async function initMlPanel(configManager) {
    let model;
    try {
        model = await loadModel('assets/ml/configurator_data.json');
    } catch (err) {
        console.error(err);
        setState('Model unavailable', 'secondary');
        $('feasNotes').innerHTML = '<li>The feasibility model could not be loaded.</li>';
        return null;
    }

    const state = { assessment: null, exIndex: 0, rankedFor: null };

    const assess = () => model.assess(configManager.generateBriefJson(), configManager.generatePlotJson());

    function setState(text, tone) {
        const badge = $('feasState');
        badge.textContent = text;
        badge.className = `badge rounded-pill text-bg-${tone}`;
    }

    function renderFeasibility() {
        const a = assess();
        state.assessment = a;
        const tone = { good: 'success', warn: 'warning', bad: 'danger' }[a.verdict];
        setState({ good: 'Likely buildable', warn: 'Uncertain', bad: 'Unlikely to solve' }[a.verdict], tone);
        const pct = Math.min(99, Math.max(1, Math.round(a.p * 100)));
        $('feasProb').textContent = `${pct}%`;
        const bar = $('feasBar');
        bar.style.width = `${(a.p * 100).toFixed(1)}%`;
        bar.className = `progress-bar bg-${tone}`;
        bar.parentElement.setAttribute('aria-valuenow', String(pct));

        const indoor = a.modules.filter((id) => !['NX_ELE_EPO_00', 'NX_ELE_GAR_00', 'NX_ELE_STA_00', 'NX_ELE_CON_00'].includes(id)).length;
        $('statModules').textContent = a.modules.length;
        $('statArea').textContent = `${Math.round(indoor * MODULE_AREA)} m²`;
        $('statGrid').textContent = `${a.f.rows}×${a.f.cols}`;
        const slack = $('statSlack');
        slack.textContent = a.f.slack;
        slack.classList.toggle('text-danger', a.f.slack < 0);
        slack.classList.toggle('text-dark', a.f.slack >= 0);
        $('feasNotes').innerHTML = a.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    }

    function renderExampleCard() {
        const a = state.rankedFor;
        if (!a) return;
        const top = a.ranked.top;
        const pick = top[state.exIndex % top.length];
        const ex = model.library[pick.idx];
        $('exampleCard').classList.remove('d-none');
        $('exampleCaption').innerHTML =
            `Closest solved layout <strong>${state.exIndex % top.length + 1} of ${top.length}</strong>` +
            ` <span class="text-muted">· from ${model.size.toLocaleString()} solver layouts · originally on a ${ex.s[0]}×${ex.s[1]} m plot</span>`;
        const diffs = model.differences(a.ranked.want, pick.idx, a.brief);
        if (!pick.fits) diffs.unshift({ kind: 'missing', text: `footprint ${ex.box.h}×${ex.box.w} is larger than this plot's ${a.f.rows}×${a.f.cols} grid` });
        $('exampleDiff').innerHTML = diffs.length
            ? diffs.map((d) => `<span class="badge rounded-pill ${d.kind === 'missing' ? 'text-bg-warning' : 'text-bg-light border'}">${escapeHtml(d.text)}</span>`).join('')
            : '<span class="badge rounded-pill text-bg-success">same rooms as your brief</span>';
    }

    // Solver replacement: closest solved layout for the current brief + site
    async function mlSolve() {
        const a = assess();
        state.rankedFor = a;
        if (!a.ranked.top.length) return { success: false, error: 'No solved layouts in the library.' };
        const pick = a.ranked.top[state.exIndex % a.ranked.top.length];
        renderExampleCard();
        return { success: true, solution: model.toSolution(pick.idx) };
    }

    async function showExample(step) {
        if (!state.rankedFor) return;
        const n = state.rankedFor.ranked.top.length;
        state.exIndex = (state.exIndex + step + n) % n;
        const pick = state.rankedFor.ranked.top[state.exIndex];
        configManager.currentSolution = model.toSolution(pick.idx);
        renderExampleCard();
        configManager.updateHouseSummary(false);
        await configManager.generateFloorPlanFromSolution();
    }

    if (SOLVER_MODE === 'ml') {
        configManager.solver = async (brief, plot) => {
            state.exIndex = 0;
            return mlSolve(brief, plot);
        };
        configManager.autoGenerate = true;
        configManager.solveLabel = 'Find Layout';
        configManager.toggleSolveButtons(true);
    }

    $('prevExampleBtn')?.addEventListener('click', () => showExample(-1));
    $('nextExampleBtn')?.addEventListener('click', () => showExample(1));

    // Live update: every brief/site change re-picks the closest layout and redraws (cheap, all in-browser)
    const live = () => SOLVER_MODE === 'ml' && $('liveUpdate')?.checked !== false;
    let timer = null;
    let busy = false, pending = false;
    async function refreshLayout() {
        if (busy) { pending = true; return; }
        busy = true;
        try { await configManager.solveHouse(); } finally {
            busy = false;
            if (pending) { pending = false; refreshLayout(); }
        }
    }
    const schedule = (e) => {
        // view switch and live toggle are not part of the brief
        if (e?.target && ['planView', 'liveUpdate'].includes(e.target.name || e.target.id)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            renderFeasibility();
            if (live()) refreshLayout();
        }, 150);
    };
    configManager.form?.addEventListener('input', schedule);
    configManager.form?.addEventListener('change', schedule);

    // Site / Building drawing
    document.querySelectorAll('input[name="planView"]').forEach((r) => r.addEventListener('change', () => {
        window.NEXUS_PLAN_VIEW = r.value;
        if (configManager.currentSolution) configManager.generateFloorPlanFromSolution();
    }));
    $('liveUpdate')?.addEventListener('change', (e) => { if (e.target.checked) refreshLayout(); });
    // Imported projects set values programmatically
    window.addEventListener('nexus:configLoaded', schedule);
    renderFeasibility();
    // Open with a layout for the default brief, so the canvas is never empty
    if (live()) refreshLayout();

    return { model, refresh: renderFeasibility };
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
