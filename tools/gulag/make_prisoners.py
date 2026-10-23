"""Build the Corn Gulag prisoners with MPFB2 (MakeHuman for Blender) and export them as glTF for three.js.

Run:  blender-gpu -b --factory-startup -P tools/gulag/make_prisoners.py -- [--only Name] [--preview]
Out:  public/games/gulag/<name>.gltf + .bin, textures shared in public/games/gulag/tex/

Every asset is CC0 MakeHuman content (skins, hair, clothes, eyes). Each prisoner is the base mesh with the
`game_engine` rig (53 bones, Unreal-style names: pelvis, thigh_l, hand_r...), a few ARKit face shapes for
reactions, eyes, brows, lashes, hair and the work suit. Hidden vertices (MPFB helpers and skin under the
clothes) are deleted outright, not masked, so the glTF needs no modifiers and keeps its shape keys.
The game does the rest: skin shading, recolouring the suit into camp padding, and all animation (IK in JS).
"""
import os
import sys

import addon_utils
import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "public", "games", "gulag")

# 0..1 sliders as in MPFB's Model panel. age 0.5 = 25 years, 0.875 ≈ 60, 1 = 90.
PRISONERS = [
    {"name": "pyotr", "skin": "jartur69_old_slavic_male_with_genitals_and_beard", "hair": None,
     "macro": {"age": 0.93, "muscle": 0.35, "weight": 0.32, "height": 0.45}},
    {"name": "bogdan", "skin": "jartur69_middleage_slavic_male_with_genitals_and_beard", "hair": None,
     "macro": {"age": 0.7, "muscle": 0.72, "weight": 0.5, "height": 0.62}},
    {"name": "lev", "skin": "middleage_caucasian_male", "hair": None,
     "macro": {"age": 0.66, "muscle": 0.45, "weight": 0.3, "height": 0.55}},
    {"name": "misha", "skin": "toigo_light_skin_male_freckles", "hair": None,
     "macro": {"age": 0.52, "muscle": 0.5, "weight": 0.35, "height": 0.5}},
    {"name": "timur", "skin": "middleage_asian_male", "hair": None,
     "macro": {"age": 0.62, "muscle": 0.6, "weight": 0.4, "height": 0.42}},
    {"name": "arkady", "skin": "onlytheghosts_old_eurasian_male", "hair": None,
     "macro": {"age": 0.82, "muscle": 0.4, "weight": 0.45, "height": 0.5}},
]
# Heads were shaved in the camps: no mesh hair (the game paints stubble on the scalp).
# casualsuit05 = padded jacket and trousers, the nearest thing to a telogreika; 01 = shirt and trousers.
CLOTHES = {"default": ["male_casualsuit05", "shoes03"], "misha": ["male_casualsuit01", "shoes03"],
           "timur": ["male_casualsuit01", "shoes03"]}
# Face shapes kept for the game (ARKit names). Everything else is dropped to keep the files small.
FACE_KEYS = ["jawOpen", "eyeBlinkLeft", "eyeBlinkRight", "browInnerUp", "browDownLeft", "browDownRight",
             "noseSneerLeft", "noseSneerRight", "mouthFrownLeft", "mouthFrownRight", "eyeWideLeft", "eyeWideRight",
             "mouthStretchLeft", "mouthStretchRight", "cheekSquintLeft", "cheekSquintRight"]
TEX_SIZE = {"skin": 2048, "default": 1024}


def mpfb():
    addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
    from bl_ext.user_default.mpfb.services import AssetService, FaceService, HumanService
    return AssetService, FaceService, HumanService


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.images):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def build(p):
    AssetService, FaceService, HumanService = mpfb()
    macro = {"gender": 1.0, "proportions": 0.5, "cupsize": 0.5, "firmness": 0.5,
             "race": {"asian": 0.33, "caucasian": 0.34, "african": 0.33}}
    macro.update(p["macro"])
    if "asian" in p["skin"]:
        macro["race"] = {"asian": 0.85, "caucasian": 0.15, "african": 0.0}
    elif "eurasian" in p["skin"]:
        macro["race"] = {"asian": 0.4, "caucasian": 0.6, "african": 0.0}
    else:
        macro["race"] = {"asian": 0.0, "caucasian": 1.0, "african": 0.0}
    body = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
    body.name = p["name"] + ".body"
    HumanService.add_builtin_rig(body, "game_engine", import_weights=True)
    skin = AssetService.find_asset_absolute_path(f"{p['skin']}/{p['skin']}.mhmat", "skins")
    HumanService.set_character_skin(skin, body, skin_type="GAMEENGINE", material_instances=False)

    def part(kind, name):
        if not name:
            return
        path = AssetService.find_asset_absolute_path(f"{name}/{name}.mhclo", kind)
        if not path:
            raise SystemExit(f"MISSING {kind} {name}")
        HumanService.add_mhclo_asset(path, body, asset_type=kind, subdiv_levels=0, material_type="GAMEENGINE")

    part("eyes", "high-poly")
    part("eyebrows", "eyebrow001")
    part("eyelashes", "eyelashes01")
    part("hair", p["hair"])
    for c in CLOTHES.get(p["name"], CLOTHES["default"]):
        part("clothes", c)
    part("teeth", "teeth_base")
    part("tongue", "tongue01")
    FaceService.load_targets(body, load_microsoft_visemes=False, load_meta_visemes=False, load_arkit_faceunits=True)
    return body


def bake_macros(body):
    """MPFB's body shape lives in shape keys (macros); the face keys sit on top. Fold everything that isn't a
    face key into the basis, so the exported mesh has its final shape and only the face keys as morphs."""
    keys = body.data.shape_keys
    if not keys:
        return
    kb = keys.key_blocks
    # A mix of every non-face key at its current value becomes the new basis.
    for k in kb:
        k.mute = k.name in FACE_KEYS
    body.shape_key_add(name="__baked", from_mix=True)
    for k in kb:
        k.mute = False
    baked = kb["__baked"]
    co = [0.0] * (3 * len(body.data.vertices))
    baked.data.foreach_get("co", co)
    basis = kb[0]
    # Face keys are stored absolute: shift them by the same offset as the basis.
    old = [0.0] * len(co)
    basis.data.foreach_get("co", old)
    for k in kb:
        if k.name in FACE_KEYS:
            kc = [0.0] * len(co)
            k.data.foreach_get("co", kc)
            k.data.foreach_set("co", [kc[i] + co[i] - old[i] for i in range(len(co))])
    basis.data.foreach_set("co", co)
    body.data.vertices.foreach_set("co", co)
    for k in list(kb):
        if k != basis and k.name not in FACE_KEYS:
            body.shape_key_remove(k)
    for k in body.data.shape_keys.key_blocks:
        k.value = 0.0
    missing = [n for n in FACE_KEYS if n not in body.data.shape_keys.key_blocks]
    if missing:
        print("FACE KEYS MISSING", missing)


def delete_masked(obj):
    """Apply every Mask modifier by deleting the vertices it hides (keeps shape keys, unlike applying it)."""
    for mod in [m for m in obj.modifiers if m.type == "MASK"]:
        vg = obj.vertex_groups.get(mod.vertex_group)
        if vg:
            idx = vg.index
            hide = set()
            for v in obj.data.vertices:
                inside = any(g.group == idx and g.weight > 0.0 for g in v.groups)
                if inside == mod.invert_vertex_group:
                    hide.add(v.index)
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in hide], context="VERTS")
            bm.to_mesh(obj.data)
            bm.free()
            print(f"  {obj.name}: deleted {len(hide)} masked vertices ({mod.name})")
        obj.modifiers.remove(mod)
    for mod in [m for m in obj.modifiers if m.type == "SUBSURF"]:
        obj.modifiers.remove(mod)


def shrink_images(prefix):
    for img in bpy.data.images:
        if img.size[0] == 0:
            continue
        cap = TEX_SIZE["skin"] if img.users and "skin" in img.name.lower() or "dif" in img.name.lower() and "male" in img.name.lower() else TEX_SIZE["default"]
        if max(img.size) > cap:
            s = cap / max(img.size)
            img.scale(int(img.size[0] * s), int(img.size[1] * s))


def export(body, p):
    rig = body.parent
    objs = [rig] + [o for o in rig.children_recursive if o.type == "MESH"]
    for o in objs:
        if o.type == "MESH":
            delete_masked(o)
            o.name = f"{p['name']}.{o.name.split('.')[-1] if o is not body else 'body'}"
    bake_macros(body)
    shrink_images(p["name"])
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    path = os.path.join(OUT, p["name"] + ".gltf")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLTF_SEPARATE", export_texture_dir="tex", use_selection=True,
        export_apply=False, export_skins=True, export_morph=True, export_morph_normal=False,
        export_animations=False, export_image_format="WEBP", export_image_quality=82, export_yup=True,
        export_extras=False, export_cameras=False, export_lights=False)
    tris = sum(len(o.data.loop_triangles) for o in objs if o.type == "MESH" and not o.data.calc_loop_triangles())
    print(f"EXPORTED {path} ({tris} triangles, {len(rig.data.bones)} bones)")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    for p in PRISONERS:
        if only and p["name"] != only:
            continue
        clear_scene()
        print("BUILD", p["name"])
        body = build(p)
        export(body, p)


main()
