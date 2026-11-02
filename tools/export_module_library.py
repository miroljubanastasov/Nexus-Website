"""Export the NX_ELE_* module blocks from the Rhino file to a JSON library
that the browser floor-plan renderer can use without Rhino / Grasshopper.

Usage:
    pip install rhino3dm
    python tools/export_module_library.py [path/to/NX_ELEMENT_MODULES.3dm] [out.json]

Every module block is flattened (nested blocks such as COLUMN, DOOR_900,
furniture are expanded with their transforms) into 2D primitives in
module-local metres, origin at the module centre, +Y = up in plan (Rhino).

Output:
{
  "units": "m", "module_size": 3.75,
  "modules": {
    "NX_ELE_LIV_00": {
      "name": "LIVING ROOM",           # from 200_PART_TAG
      "label": "Living Room", "area": 14,   # from 200_HIGHLIGHT user text
      "layers": {
        "100_INTERRIOR WALL REF": [ {"p": [[x,y],...], "c": false}, ... ],
        "300_FURN_PRIM": [...],
        ...
      },
      "texts": [ {"layer": ..., "text": ..., "x":..., "y":..., "h":..., "rot":...} ]
    }, ...
  }
}
"""
import json
import math
import os
import sys

import rhino3dm as r

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_IN = os.path.join(HERE, "..", "assets", "rhino", "NX_ELEMENT_MODULES.3dm")
DEFAULT_OUT = os.path.join(HERE, "..", "assets", "modules", "module_library.json")

# 3D-only content that never appears on plan drawings.
SKIP_LAYER_PREFIXES = ("400_",)
SKIP_LAYERS = {"200_GRID", "100_FURN_REF_PT", "100_VOLUME REF"}
ARC_SEG_PER_RAD = 8        # sampling density for arcs / curves
ROUND = 4                  # decimals (0.1 mm)

IDENTITY = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def xf_to_list(x):
    return [[x.M00, x.M01, x.M02, x.M03],
            [x.M10, x.M11, x.M12, x.M13],
            [x.M20, x.M21, x.M22, x.M23],
            [x.M30, x.M31, x.M32, x.M33]]


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def apply(m, x, y, z=0.0):
    return (m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
            m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3])


def scale_of(m):
    return math.sqrt(abs(m[0][0] * m[1][1] - m[0][1] * m[1][0]))


def curve_points(g):
    """Return (points, closed) for a curve, sampling non-linear parts."""
    if isinstance(g, r.LineCurve):
        return [g.PointAtStart, g.PointAtEnd], False
    if isinstance(g, r.PolylineCurve):
        return [g.Point(i) for i in range(g.PointCount)], g.IsClosed
    if isinstance(g, r.PolyCurve):
        pts = []
        for i in range(g.SegmentCount):
            seg_pts, _ = curve_points(g.SegmentCurve(i))
            pts.extend(seg_pts if not pts else seg_pts[1:])
        return pts, g.IsClosed
    if isinstance(g, r.ArcCurve) and not g.IsClosed:
        arc = g.Arc
        n = max(4, int(abs(arc.AngleRadians) * ARC_SEG_PER_RAD) + 1)
    else:
        n = 48
    t0, t1 = g.Domain.T0, g.Domain.T1
    pts = [g.PointAt(t0 + (t1 - t0) * i / n) for i in range(n + 1)]
    return pts, g.IsClosed


class Exporter:
    def __init__(self, path):
        self.m = r.File3dm.Read(path)
        if self.m is None:
            raise SystemExit(f"Cannot read {path}")
        self.by_id = {str(o.Attributes.Id): o for o in self.m.Objects}
        self.idefs = {str(d.Id): d for d in self.m.InstanceDefinitions}
        self.layer_names = [l.FullPath.split("::")[-1] for l in self.m.Layers]

    def layer(self, o, inherited):
        name = self.layer_names[o.Attributes.LayerIndex]
        return inherited if (name in ("0", "Default") and inherited) else name

    def flatten(self, idef, xf, inherited_layer, out, depth=0):
        for oid in idef.GetObjectIds():
            o = self.by_id.get(str(oid))
            if o is None:
                continue
            g = o.Geometry
            lay = self.layer(o, inherited_layer)
            if isinstance(g, r.InstanceReference):
                child = self.idefs.get(str(g.ParentIdefId))
                if child is not None and depth < 8:
                    self.flatten(child, mul(xf, xf_to_list(g.Xform)), lay, out, depth + 1)
                continue
            if lay in SKIP_LAYERS or lay.startswith(SKIP_LAYER_PREFIXES):
                continue
            if isinstance(g, r.Curve):
                pts, closed = curve_points(g)
                p2 = [[round(c, ROUND) for c in apply(xf, p.X, p.Y, p.Z)] for p in pts]
                if closed and len(p2) > 1 and p2[0] == p2[-1]:
                    p2 = p2[:-1]
                # drop consecutive duplicates
                p2 = [p for i, p in enumerate(p2) if i == 0 or p != p2[i - 1]]
                if len(p2) >= 2:
                    item = {"p": p2, "c": bool(closed)}
                    us = dict(o.Attributes.GetUserStrings())
                    us = {k: v for k, v in us.items() if not k.startswith("$")}
                    if us:
                        item["u"] = us
                    out["layers"].setdefault(lay, []).append(item)
            elif isinstance(g, r.Text):
                pl = g.Plane
                x, y = apply(xf, pl.Origin.X, pl.Origin.Y, pl.Origin.Z)
                rot = math.degrees(math.atan2(pl.XAxis.Y, pl.XAxis.X))
                h = getattr(g, "TextHeight", 0) or 0
                out["texts"].append({
                    "layer": lay, "text": g.PlainText.replace("\r\n", "\n").strip(),
                    "x": round(x, ROUND), "y": round(y, ROUND),
                    "h": round(h * scale_of(xf), ROUND), "rot": round(rot, 2),
                })
            # Points, meshes, breps, hatches: not needed for 2D plans.

    def export(self):
        lib = {"units": "m", "module_size": 3.75, "source": "NX_ELEMENT_MODULES.3dm", "modules": {}}
        for d in self.m.InstanceDefinitions:
            if not d.Name.startswith("NX_ELE_"):
                continue
            out = {"layers": {}, "texts": []}
            self.flatten(d, IDENTITY, None, out)
            tag = next((t["text"] for t in out["texts"] if t["layer"] == "200_PART_TAG"), "")
            lines = [s for s in tag.split("\n") if s.strip()]
            out["name"] = lines[1] if len(lines) > 1 else d.Name
            hl = next((it for it in out["layers"].get("200_HIGHLIGHT", []) if it.get("u")), None)
            if hl:
                out["label"] = hl["u"].get("NAME")
                try:
                    out["area"] = float(hl["u"].get("AREA"))
                except (TypeError, ValueError):
                    pass
            lib["modules"][d.Name] = out
        return lib


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IN
    dst = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    lib = Exporter(src).export()
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w") as f:
        json.dump(lib, f, separators=(",", ":"))
    print(f"Wrote {len(lib['modules'])} modules to {dst} ({os.path.getsize(dst) // 1024} KB)")
    for k, v in sorted(lib["modules"].items()):
        print(f"  {k:20s} {v['name']:<28s} " + ", ".join(f"{l}:{len(c)}" for l, c in sorted(v["layers"].items())))


if __name__ == "__main__":
    main()
