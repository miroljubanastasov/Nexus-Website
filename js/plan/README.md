# Plan renderer

Draws Nexus floor plans in the browser from solver output. Rhino Compute and
`assets/grasshopper/Configurator_Element_Drawings.gh` are no longer needed for this.

```
assets/rhino/NX_ELEMENT_MODULES.3dm   module blocks (source of truth for drawings)
        │  tools/export_module_library.py   (pip install rhino3dm; re-run after editing the .3dm)
        ▼
assets/modules/module_library.json    2D linework per module, per layer, metres
        │  js/plan/plan-renderer.js
        ▼
SVG per level
```

```js
import { loadModuleLibrary, renderPlan, renderAllLevels } from './js/plan/plan-renderer.js';
const lib = await loadModuleLibrary('assets/modules/module_library.json');
el.innerHTML = renderPlan(lib, solution, 0, { title: 'Ground floor' });
// or: renderAllLevels(lib, solution) -> [{ level, title, svg }]
```

The renderer is a dependency-free ES module and works in the browser or in Node.

`solution` is `{ house: {...} }` or the house itself, as written by Nexus_Mind
`mind/io/write_utils.house_to_json` after `house.post_process_solution()`. Example:
`assets/saved/sample_NX_ELEMENT_14_house.json`.

```json
{
  "grid_shape": [rows, cols, levels],
  "grid_size": 3.75,
  "modules": [{ "name": "Kitchen", "type": "NX_ELE_KIT_00", "position": [row, col, level],
                "rotation": 0, "flip": false, "is_indoor": true, "open_to_sky": false }],
  "partitions": [{ "type": "NX_ELE_PAR_INS_00", "cell": [row, col], "level": 0, "rotation": 0, "flip": false }]
}
```

## Conventions

These were checked against the Grasshopper SVGs in `assets/output/`. Those SVGs were
generated from `Nexus_Mind/Nexus_Element_Configurator/Solver_Solutions/NX_ELEMENT_05`.

- Cells are 3.75 m. `position` is `[row, col, level]`: row 0 is the north edge and rows run
  southwards (down the page); columns run west to east (left to right).
- `rotation` counts clockwise quarter turns in plan, so 0 = N, 1 = E, 2 = S, 3 = W. This matches the
  module's corridor side and the partition rotation in `mind/core/element/partition.py`.
- `flip` mirrors the module across its local north-south axis (left↔right) before it is rotated.
- `is_indoor` is optional. If it is missing, `NX_ELE_GAR_*` and `NX_ELE_EPO_*` count as outdoor.

## Wall rules

These reproduce what the Grasshopper definition draws:

- A module side that faces no indoor module on the same level is a facade wall, 0.305 m thick
  (0.075 m inside the grid line, 0.23 m outside).
  - Wherever the block has `100_FACADE OPENNING REF`, that wall has an opening with glazing.
  - Openings stop 0.2375 m short of the corners, where the columns are.
- A side shared with another indoor module keeps only the `100_INTERRIOR WALL REF` lines on it,
  drawn as 0.15 m walls.
- `100_DOOR_OPEN_REF` cuts door openings into any wall.
- The `100_COLUMN REF` blocks (8 per module) are drawn as cut elements. Open-to-sky modules
  (gardens) get no columns.
- Partitions (`NX_ELE_PAR_*`) are placed on their cell like modules. Their wall refs become
  0.15 m walls, and a door is cut where the block has one.
- A module type with no block in the `.3dm` (e.g. `NX_ELE_LIB_00` for now) gets a generic
  open module and is reported in `buildLevel(...).missing`.

## Options

See `DEFAULT_OPTIONS` in `plan-renderer.js`: `furniture`, `entourage`, `labels`, `areas`,
`grid`, `dimensions`, `roomFill`, `scale`, `margin`, `title`.

In `floorplans.html` this renderer is the default. Add `?engine=compute` to use the old
Rhino Compute path instead.

## Feasibility model and layout library

`js/ml/feasibility.js` runs the Nexus_Mind feasibility model (gradient-boosted trees) and
the library of solved layouts in the browser. Its data file is `assets/ml/configurator_data.json`.
To update it after retraining, run this in Nexus_Mind:

```
PYTHONPATH=src python -m mind.training.export_configurator \
    --out ../Nexus-Website/assets/ml/configurator_data.json
```

`js/floorplans/ml-panel.js` connects it to `floorplans.html`:
- a live feasibility estimate in the side panel, updated as the form changes
- **Find Layout**, which takes the closest solved layout for the brief and site, draws its
  plans, and lets you step through the next closest matches

Add `?solver=api` to use the Python solver service on `localhost:8080` instead.
