/**
 * Scene-style inference.
 *
 * For a native insert to feel native, the generated ad has to be rendered in
 * the *same visual medium* as the host clip — a Coca-Cola can in a Minecraft
 * video should be blocky voxel cubes, not a photoreal can pasted on top. We
 * can't run a vision classifier here (no model, and the Kling key isn't wired
 * yet), so we infer a best-guess style from cheap signals on the source and
 * let the operator override it in the UI. Kling also sees the start frame, so
 * even on the "native" default it will tend to match the scene; the explicit
 * style just lets us *name* the medium when we want to force it.
 */

export type StyleId =
  | "native"
  | "voxel"
  | "anime"
  | "claymation"
  | "pixel"
  | "lego"
  | "lowpoly"
  | "watercolor"
  | "retro3d";

export type SceneStyle = {
  id: StyleId;
  /** short chip label */
  label: string;
  /** how the *scene* is described in the prompt */
  sceneDescriptor: string;
  /** how the *product* should be rendered, slotted into the prompt */
  productClause: string;
  /** keywords that, found in a source name/title, select this style */
  match: string[];
};

/**
 * Ordered styles. `native` is the default (match the footage as-is); the rest
 * are stylized mediums. `match` keywords drive auto-detection from the source.
 */
export const STYLES: SceneStyle[] = [
  {
    id: "native",
    label: "Native (match footage)",
    sceneDescriptor: "the original live-action scene, photoreal and unchanged",
    productClause:
      "rendered photorealistically, matching the scene's exact lighting, lens, grain and materials",
    match: [],
  },
  {
    id: "voxel",
    label: "Minecraft / voxel",
    sceneDescriptor: "a blocky voxel Minecraft world made of textured cubes",
    productClause: "built entirely from chunky Minecraft-style voxel blocks",
    match: ["minecraft", "voxel", "blockgame", "mc"],
  },
  {
    id: "anime",
    label: "Anime / cel",
    sceneDescriptor: "a hand-drawn anime scene with cel shading and bold linework",
    productClause: "drawn as a cel-shaded anime prop with clean ink outlines",
    match: ["anime", "manga", "ghibli", "amv", "waifu"],
  },
  {
    id: "claymation",
    label: "Claymation",
    sceneDescriptor: "a stop-motion claymation set with visible fingerprints and soft clay",
    productClause: "sculpted from modelling clay in a stop-motion claymation style",
    match: ["claymation", "clay", "stop motion", "stopmotion", "aardman"],
  },
  {
    id: "pixel",
    label: "Pixel art",
    sceneDescriptor: "a retro 16-bit pixel-art scene with a limited palette",
    productClause: "rendered as crisp 16-bit pixel-art sprite work",
    match: ["pixel", "8bit", "16bit", "retro game", "snes", "arcade"],
  },
  {
    id: "lego",
    label: "LEGO bricks",
    sceneDescriptor: "a world built from glossy interlocking LEGO bricks and minifigures",
    productClause: "assembled from glossy LEGO bricks with visible studs",
    match: ["lego", "brick", "minifig"],
  },
  {
    id: "lowpoly",
    label: "Low-poly 3D",
    sceneDescriptor: "a stylized low-poly 3D scene with flat-shaded faceted geometry",
    productClause: "modelled as faceted flat-shaded low-poly geometry",
    match: ["low poly", "lowpoly", "polygon", "blender"],
  },
  {
    id: "watercolor",
    label: "Watercolor",
    sceneDescriptor: "a soft hand-painted watercolor scene with bleeding pigment and paper texture",
    productClause: "painted in loose watercolor washes on textured paper",
    match: ["watercolor", "watercolour", "painting", "painted"],
  },
  {
    id: "retro3d",
    label: "PS1 / retro 3D",
    sceneDescriptor: "a gritty PS1-era retro 3D scene with low-res textures and vertex wobble",
    productClause: "rendered with chunky low-res PS1-era textures and affine warping",
    match: ["ps1", "ps2", "n64", "retro 3d", "lowres", "dreamcast"],
  },
];

export const styleById = (id: StyleId): SceneStyle =>
  STYLES.find((s) => s.id === id) ?? STYLES[0];

/**
 * Best-guess style from a source. We only have a filename (uploads) or a video
 * id (YouTube) to go on — no title — so detection is keyword-based and falls
 * back to `native`. The UI lets the operator correct it.
 */
export function inferStyle(hint: string | undefined | null): SceneStyle {
  const text = (hint || "").toLowerCase();
  if (text) {
    for (const style of STYLES) {
      if (style.id === "native") continue;
      if (style.match.some((kw) => text.includes(kw))) return style;
    }
  }
  return STYLES[0];
}
