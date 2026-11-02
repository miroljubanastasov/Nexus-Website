# Handoff: Nexus-Website floor-plan app (cloud session → local)

Branch: `claude/practical-newton-z0syvh` (Nexus-Website). Written 2026-11-02 when the work moved
from the cloud session to a local one. The companion Nexus_Mind work (solver, dataset, models) is on
Nexus_Mind branch `ccr-cb9f0d4d-o8seos`, owned by the other session ("Nexus Mind repo review").

## Goal

A static web app with **inference only** in production: no VM, no solver service. CP-SAT runs only
offline to make training data. The user picks a brief and a site. The app shows a feasibility
estimate and floor plans that come, in the end, from a trained placement model decoded in the browser
under the solver's hard rules.

Split of work:
- Nexus_Mind session: data generation, training, model export (ONNX), reference code and test vectors.
- This repo: everything that runs in the browser (rendering, encoding, rule checks, decoder, UI).

## Current state (all pushed)

### Live app: `floorplans.html`
- **Feasibility:** live estimate from the Nexus_Mind gradient-boosted classifier, in `js/ml/feasibility.js` with data in `assets/ml/configurator_data.json`.
- **Plans:** come from **catalogue retrieval**: the closest of 1,066 solver-solved layouts, matched on
  - rooms, levels and footprint
  - north angle (with east–west mirroring for 360−n)
  - porch side vs access
  - access sides, once the export carries `acc`
- **Live update:** every form change re-runs the match and redraws, and the floor in view is kept.
- **Views:** Site view (plot, setbacks, grid, street/access, north arrow, scale bar) and Building view.
- **UI:**
  - sticky feasibility result
  - Brief and Site sections
  - layout bar (browse 8 matches, room differences, stats, floor picker, Site/Building switch)
  - Open/Save project
- **Legacy paths:** `?solver=api` uses the old solver service; `?engine=compute` uses the old Rhino Compute drawing.
- **Published copy:** https://claude.ai/artifact/6GTu7DxmsV5jYnzWYF38WQ (private). It is built with
  `tools/build_artifact_bundle.py`, which needs vendored Bootstrap/Font Awesome (see the script header).

### Plan drawing (no Rhino)
- `tools/export_module_library.py`: `assets/rhino/NX_ELEMENT_MODULES.3dm` → `assets/modules/module_library.json`.
- `js/plan/plan-renderer.js`: `renderPlan`, `renderSitePlan`, `buildLevel`, `sitePlacement`. Conventions are in `js/plan/README.md`:
  - position `[row, col, level]`
  - rotation = clockwise quarter turns (0=N)
  - flip mirrors local X before rotating
  - 3.75 m cells
- The renderer draws the post-processed drawing types too (STA_01/02, CON_01, partitions).

### Placement model groundwork (browser side), **done and tested**

| File | What | Test | Result |
|---|---|---|---|
| `js/ml/placement.js` | Interface v1 encoding: vocabulary, `solverType`, `encodeSite` (site_scalar[16], site_grid[14,12,12], incl. a port of House grid/process_cells, solar exposure, access cells), `moduleOrder`, decoder state, `trainingSteps`, action index | `node tests/placement.test.mjs` | **7/7** cases match the Python reference |
| `js/ml/postprocess.js` | Port of `House.post_process_solution`: relabels, GFA, all/secondary neighbours, edge context, passages, access points, flips, partitions, summary; `modulePairs()` = per-instance pairs from Brief.load_modules/add_stairs | `node tests/postprocess.test.mjs` | **3/3** houses match (16/19/21 modules) |
| `assets/ml/module_config.json` | MODULES flags, reward/adjacency pairs, rotation pairs, objective constants (Nexus_Mind `docs/samples/module_config.json`) | | |

Fixtures in `tests/fixtures/` are byte-identical to Nexus_Mind `436cad4`.

### Analysis scripts (`tools/analysis/`, run with node from that folder)
- `cover.mjs`: retrieval coverage. On 400 random briefs, exact rooms + fits + porch OK: 25% at 267 layouts, 31% at 533, **40% at 1,066**. Extrapolated ~70% at 20k.
- `north.mjs` / `porch.mjs`: orientation matching; porch-facing-street check (now 0/96 wrong).
- `mir.mjs`: renders a layout and its east–west mirror.

## What I was in the middle of: the rule checks (WIP, nothing on disk yet)

Planned file: `js/ml/rules.js` (masks and final validation), then `js/ml/decoder.js` (beam search).
I had read every constraint in Nexus_Mind `src/mind/algorithms/element_house_solver.py` @ `3713171`.
This is the spec I was implementing; each item maps 1:1 to a solver constraint.

**Module list and ids** (Brief.load_modules + House.add_stairs; ids in this order):
- ENT, EPO, LIV, [CON over LIV], [GAR], then KIT_01 *or* (DIN, KIT, [CON over DIN])
- MBR, MBA, TRA, [OFF], [LIB], [SPA], [PBR, PBA]
- SBR×n, [GBR], SBA×ceil(beds/2) (bathrooms come after all bedrooms)
- STA×max_levels (stair i fixed to level i), only if max_levels > 1

Fixed levels: GROUND → 0; CON → 1 (mandatory when max_levels > 1); stair i → i.
Check against the ids in the test-vector houses.

**Per-action masks** (cheap, at each step):
1. Cell inside rows×cols (full rectangle), level < max_levels, cell free on that level.
2. ACCESS modules (ENT, EPO): level 0 and an access cell (`accessCells`).
3. Footprint: modules on the level < `max_modules_footprint`. This counts **all** modules, outdoor too, on every level (max_footprint_const).
4. Support: level > 0 needs an occupied cell below (any module, porch included). Allow "pending" support, checked at the end, while remaining modules can still fill it.
5. Open to sky (GAR): nothing above a garden at any level, in either placement order.
6. Stairs: one stacked action on levels 0..Lu−1, same cell, same rotation.
   - Lu is a beam branch (2..max_levels; Lu=1 means no stairs, only when there is no void).
   - Every level < Lu needs a non-stair module, and no module may sit at level ≥ Lu.
7. Void CON: level 1, exactly the cell of its base (LIV or DIN): a forced action.
8. Facade modules (FAC/VIEW/PRIV/SOLAR) need a side d where:
   - no indoor cell lies on the same level in the whole line to the grid edge
   - VIEW → `view[d]`, else PRIV → `privacy[d]`; SOLAR → `solar[d]`
   - the rotation is compatible: local side `(d + rot) % 4` has `FAC_<side>`

   Later indoor placements must not close the **last** valid side of an already-placed facade module.
9. Connectivity (partial):
   - each module needs a placed allowed partner adjacent on the same level, or a free adjacent cell plus a remaining allowed partner ("connects later"; bedrooms come before their bathrooms)
   - mandatory partners (ENT–EPO, LIV–DIN, LIV–KIT_01, DIN–KIT, MBR–MBA, PBR–PBA) must be adjacent on the same level when both are placed; if one is not placed yet, keep a free adjacent cell
   - re-check neighbours whose free cells shrink
   - pairs are **per instance**: bedroom k (SBR in order, then GBR) ↔ shared bathroom k//2 only, plus stairs (`modulePairs`)

**Final check of a complete layout:**
- Every level used has ≥ 2 modules: each module needs ≥ 1 connection.
- Support and open-to-sky hold.
- Per level, a spanning tree over allowed same-level adjacent pairs:
  - it contains all mandatory pairs
  - degree ≤ VAL; bedrooms have VAL=1, so they are leaves
  - rotations are compatible on every tree edge: `(rot_a, rot_b) ∈ rotation_pairs[dir]` with b at a's `dir`
  - stairs share one rotation across levels
  - facade modules keep a rotation compatible with a still-open valid side

  Search: backtrack over edges sorted by reward (high first), with union-find and degree caps. For each tree, solve the rotations as a tree CSP by DP, preferring the model's rotations. Try a stair rotation s = 0..3 for all levels.
- Then derive the solver outputs:
  - `primary_facade`: the first valid side compatible with the final rotation
  - `all_facade`: indoor modules; a side is true if it is outside the grid or the neighbour cell on the level is not indoor
  - `neighbours`: the tree partner per direction
  - tree edges as (min, max)

  Feed these to `postProcess()` and then the renderer.
- Score: connectivity reward Σ(value×10) over tree edges, then envelope − 0.95·volume (perimeter_objective, envelope mode). Rank like SAT phase 1/phase 2: keep candidates within 90% of the best reward, then the most compact.

**How to test the rule port before a real model:**
1. Every solved test house (7 test vectors + 3 post-process fixtures + `assets/saved/sample_NX_ELEMENT_14_house.json`) must pass the final check. This shows the rules are not too strict.
2. Teacher-forced decoding (a policy that puts the true action first) must rebuild each solved house. This shows the masks never reject a true action.
3. Heuristic decoding of random briefs, then checked by the real solver. Nexus_Mind `eval_placement.py check` fixes positions in CP-SAT, with instances matched by type and rotations free.

## Next steps (in order)

1. **Rule checks:** write `js/ml/rules.js` from the spec above, with tests 1 and 2.
2. **Decoder loop** (`js/ml/decoder.js`): beam search with backtracking on dead-ends.
   - Initial beams branch on Lu.
   - Each step builds the v1 tensors from the state, gets logits, masks them and expands the top-K.
   - The stair step uses level-0 logits and replicates.
   - Complete beams go through the final check, post-processing and scoring.
   - If every beam dies, fall back to catalogue retrieval.
3. **Stand-in model:** a dummy policy with the v1 interface, uniform or heuristic, so the loop runs end to end. Then load the real ONNX with `onnxruntime-web` (pin an exact version from jsDelivr), using the inputs below.
4. **`feasibility.js` / `ml-panel.js` type update:** post-processed `house` records now use drawing types. Map them with `solverType()` (`js/ml/placement.js`) wherever type ids are counted or compared:
   - drawing types: upper stairs `NX_ELE_STA_02` (middle) and `NX_ELE_STA_01` (top); a void with one tree edge is `NX_ELE_CON_01`; houses also carry `summary`
   - `feasibility.js`: `toSolution` (OUTDOOR/BATHS/BEDS counts, summary) and anything that reads `e.house`/`e.h`
   - `ml-panel.js`: `NOT_INDOOR`

   Use `house.summary` when present. The renderer already draws the drawing types.
5. **Catalogue replacement:** when Nexus_Mind sends the new export, replace `assets/ml/configurator_data.json`. The export comes after the regeneration with the stair and void fixes and the wider domain, and adds per-entry:
   - `house` (full post-processed house_to_json)
   - `acc` / `sb` / `nd`, each `[S, N, E, W]`

   Then:
   - check the ranking's `acc` term
   - check mirroring of the full `house`: `mirrorHouse` in `feasibility.js` swaps cols/rot/flip/facades, and E/W must also be swapped in `acc`/`sb`/`nd`
   - re-run `tools/analysis/cover.mjs`, `porch.mjs`, `north.mjs`
   - rebuild and republish the Artifact

   The 20k set improves retrieval (~40% → ~70% exact coverage) even before the model ships.
6. **Ship the model** only when it beats retrieval on the held-out set:
   - right rooms (by construction)
   - fits the plot
   - porch side and orientation
   - A/V and connectivity within an agreed margin of SAT

## Waiting on

- **Nexus_Mind:**
  - the trained placement model (ONNX + sidecar)
  - the new catalogue export
  - optionally the smoke ONNX (1.39 MB, int8 0.38 MB) for an early end-to-end test. It is only in their container (`data/` is gitignored); ask them for it.
- **The user:** optionally running the local 20k generation and pushing it to Nexus_Mind branch `data/gen-20k`. Commands are below.

## Latest Nexus_Mind result (`3713171`)

- `src/mind/training/train_placement.py` and `eval_placement.py` (decode + CP-SAT validity check).
- Smoke model: 909 solved layouts plus E/W mirrors, 5 epochs.
  - Teacher-forced on 250 held-out houses: cell@1 0.64, acc@5 0.84.
  - ONNX 1.39 MB (int8 0.38 MB); torch vs onnxruntime max diff 2e-6.
- **Greedy whole-house decoding with partial masks: only 1 of 60 houses valid in the solver.** With the full masks listed above, greedy still dead-ends on ~30%. So the browser rule checks and the beam search with backtracking are essential.
- Bulk data generation is ongoing there (1,673 samples at the last report). They will retrain on the growing set, plus the user's 20k.

## Interface v1 (agreed; reference: Nexus_Mind `src/mind/training/placement.py`)

| Input | Shape | Notes |
|---|---|---|
| `site_scalar` | float32[1,16] | north_sin, north_cos, max_levels, max_footprint, floor_height, rows, cols, access_S/N/E/W, nd_S/N/E/W, grid_offset_m (= distance_from_grid.W − setbacks.W) |
| `site_grid` | float32[1,14,12,12] | allowed, access_cell, view_NESW, privacy_NESW, solar_NESW (solar per site side, repeated on every cell) |
| `remaining` | float32[1,T] | modules of each type still to place, T = 20 (VOCAB order in placement.js) |
| `layout` | float32[1,3,12,12,T+5] | one-hot type, one-hot rotation, void_over flag |
| `module_type` | int64[1] | type index of the module to place |
| `step` | int64[1] | step number |

- **Output:** `logits` float32[1,1728], with index = ((level·12 + row)·12 + col)·4 + rotation.
- **Order:** stairs first as one stacked step (level-0 action, same cell on every used level), then module id order, each CON_00 right after its base.
- **Types:** the model uses solver types only (STA_00, CON_00); map drawing types with `solverType`.
- **Inside the model:** masks cover cell exists, level < max_levels and (level, cell) free. Everything else is the browser's job.

## Data formats

- **Solved house (`house_to_json`):**
  - top level: `{grid_shape:[rows,cols,levels], grid_size:3.75, modules:[…], partitions:[…], summary}`
  - modules: `{id, name, type, position:[row,col,level], rotation, flip, is_indoor, open_to_sky, primary_facade{NESW}, all_facade{NESW}, void_over}`
  - partitions: `{type, cell:[row,col], level, rotation, flip, from_module, to_module}`
- **Grid:** row 0 = north (rear), the last row = street (S); col runs W→E.
- **Catalogue (`configurator_data.json`):** `{features, model{baseline, trees[f,t,l,r,leaf,v]}, types[{id,name}], library[{b, s:[w,d,levels,north,footprint], g:[rows,cols], m:flat[ti,row,col,level,rot]*, house?, acc?, sb?, nd?}]}`.
- **Mirror (E↔W):** col → cols−1−col, rotation → −k mod 4, flip toggled, facades E↔W, north → 360−n, and site access/setbacks/neighbour distances E↔W. The solver confirmed this valid (8/8 OPTIMAL).

## Local data generation (user, Windows)

```
git clone -b ccr-cb9f0d4d-o8seos https://github.com/miroljubanastasov/Nexus_Mind.git
cd Nexus_Mind
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PYTHONPATH = "src"; .venv\Scripts\python.exe -m mind.training.generate_dataset --n 5 --time 10 --workers 2 --patterns full --seed 1 --out data\test.jsonl
$env:PYTHONPATH = "src"; $jobs = 4; $n = 5000; 1..$jobs | ForEach-Object { $s = 100 + $_; Start-Process -FilePath ".venv\Scripts\python.exe" -ArgumentList "-m mind.training.generate_dataset --n $n --time 10 --workers 2 --patterns full --seed $s --out data\gen_seed$s.jsonl" }
```

- `$jobs` = physical cores ÷ 2, and `$n` = 20000 ÷ `$jobs`.
- Use one file per process. Restart with new seeds (200+). Nexus_Mind uses seeds ≥ 1000.
- Zip the files and push them to Nexus_Mind branch `data/gen-20k`.
- Expect ~7.5 kB per record, so ~150 MB raw and ~8 MB gzipped for 20k.

## Running things locally

- Serve the repo and open `floorplans.html`: `python -m http.server 5500`.
- Tests: `node tests/placement.test.mjs`, `node tests/postprocess.test.mjs`.
- Module library: `pip install rhino3dm` then `python tools/export_module_library.py`.
