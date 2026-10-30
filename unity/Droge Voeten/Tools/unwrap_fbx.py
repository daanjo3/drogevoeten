"""Give an FBX's meshes UVs with Blender's Smart UV Project, then export it as FBX again.

Only meshes without a UV map are unwrapped; meshes that already have UVs are left as they are.
Object and mesh names are kept, so Unity's references to the model keep working after reimport.

Usage:
    blender --background --python unwrap_fbx.py -- <input.fbx> <output.fbx>

<output.fbx> may be the same path as <input.fbx>; make a backup first in that case.
"""

import math
import sys

import bpy

ANGLE_LIMIT_DEGREES = 66.0
ISLAND_MARGIN = 0.02


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 2:
        sys.exit("usage: blender --background --python unwrap_fbx.py -- <input.fbx> <output.fbx>")
    src, dst = argv

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    todo = [o for o in meshes if not o.data.uv_layers]
    print(f"{len(meshes)} meshes, {len(todo)} without UVs")

    for obj in todo:
        obj.data.uv_layers.new(name="UVMap")

        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(ANGLE_LIMIT_DEGREES), island_margin=ISLAND_MARGIN)
        bpy.ops.object.mode_set(mode='OBJECT')
        print(f"  unwrapped {obj.name}")

    bpy.ops.export_scene.fbx(filepath=dst, use_selection=False)
    print(f"wrote {dst}")


main()
