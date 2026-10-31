"""Reduce the triangle count of an FBX's meshes with Blender's Decimate (Collapse), then export it as FBX again.

Every mesh keeps <ratio> of its triangles (0.1 = 10%). UVs and materials are kept; normals are recomputed as smooth
normals, because imported custom normals don't survive the collapse. Object, mesh and material names are kept, and
so is the file's unit (FBX UnitScaleFactor: centimeters or meters), so Unity imports the model at the same size and
its references to it keep working.

Usage:
    blender --background --python decimate_fbx.py -- <input.fbx> <output.fbx> <ratio>

<output.fbx> may be the same path as <input.fbx>; make a backup first in that case.
"""

import sys

import bpy
from io_scene_fbx import parse_fbx


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def unit_scale_factor(path):
    """The FBX GlobalSettings UnitScaleFactor: 1 = centimeters, 100 = meters."""
    root, _ = parse_fbx.parse(path)

    def find(elem):
        for child in elem.elems:
            if child.id == b"P" and child.props and child.props[0] == b"UnitScaleFactor":
                return float(child.props[-1])
            found = find(child)
            if found is not None:
                return found
        return None

    settings = next((e for e in root.elems if e.id == b"GlobalSettings"), None)
    factor = find(settings) if settings is not None else None
    return factor if factor is not None else 1.0


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 3:
        sys.exit("usage: blender --background --python decimate_fbx.py -- <input.fbx> <output.fbx> <ratio>")
    src, dst, ratio = argv[0], argv[1], float(argv[2])
    if not 0.0 < ratio <= 1.0:
        sys.exit("ratio must be in (0, 1]")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)

    for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        before = triangle_count(obj)

        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        modifier = obj.modifiers.new(name="Decimate", type='DECIMATE')
        modifier.decimate_type = 'COLLAPSE'
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)

        # The imported custom split normals no longer match the collapsed surface
        if obj.data.has_custom_normals:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bpy.ops.object.shade_smooth()

        print(f"  {obj.name}: {before} -> {triangle_count(obj)} triangles")

    # Blender's default export writes centimeters (1); a meters file (100) needs FBX_SCALE_UNITS to stay meters
    source_units = unit_scale_factor(src)
    scale_option = 'FBX_SCALE_UNITS' if abs(source_units - 100.0) < 1e-3 else 'FBX_SCALE_NONE'
    bpy.ops.export_scene.fbx(filepath=dst, use_selection=False, apply_scale_options=scale_option)
    print(f"  units: source UnitScaleFactor {source_units}, exported with {scale_option}")
    print(f"wrote {dst}")


main()
