/**
 * Generation core - isomorphic (no node/browser-only imports).
 *
 * Turns a selected moment (the captured frame + detected surface + chosen
 * brand + scene style) into a provider-agnostic spec, and from that into the
 * exact Kling image-to-video request.
 *
 * The defining constraint: the generated clip must begin and end on the *same*
 * frame, so when it's spliced into the source at the chosen timestamp it loops
 * straight back into the original footage with no visible seam. In Kling terms
 * that means `image` (first frame) === `image_tail` (last frame).
 */

import type { Brand } from "./types";
import { styleById, type StyleId } from "./style";

/** A placement surface, the subset of analyze.ScoredSurface we need downstream. */
export type GenSurface = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Everything needed to generate one native cut. Sent to POST /api/generate. */
export type GenerationSpec = {
  brand: Brand;
  surface: GenSurface;
  styleId: StyleId;
  /** the captured moment, as a data URL - used for BOTH first and last frame */
  frame: string;
  /** source timestamp the clip splices back into (seconds) */
  timestamp: number;
  /** clip length; Kling supports 5 or 10 */
  durationSec: 5 | 10;
  /**
   * What's actually in the video, from the GPT vision pass on this same frame.
   * Fed to Kling as grounding so the ad is generated *native to this scene*,
   * while `frame` (first === last) stays the untouched source frame for a
   * seamless splice. Absent on the heuristic path.
   */
  sceneContext?: string;
};

export const DURATIONS = [5, 10] as const;

/** The exact body we POST to Kling's image2video endpoint. */
export type KlingRequest = {
  model_name: string;
  mode: "std" | "pro";
  duration: "5" | "10";
  /** first frame - base64 (no data: prefix) or a URL */
  image: string;
  /** last frame - identical to `image` for a seamless splice */
  image_tail: string;
  prompt: string;
  negative_prompt: string;
  cfg_scale: number;
};

export type GenStatus = "queued" | "processing" | "succeeded" | "failed";

/** Coarse progress for a status (Kling reports no %; mock uses elapsed time). */
export function statusProgress(status: GenStatus): number {
  switch (status) {
    case "succeeded":
      return 1;
    case "processing":
      return 0.6;
    case "queued":
      return 0.15;
    default:
      return 0;
  }
}

/** A generation job, as returned by POST /api/generate and GET /api/generate/[id]. */
export type GenerationJob = {
  id: string; // "kling:<taskId>" | "mock:<token>"
  provider: "kling" | "mock";
  status: GenStatus;
  progress: number; // 0..1
  videoUrl: string | null;
  message?: string;
  /** redacted echo of the Kling request, for the UI inspector */
  request?: KlingRequest;
};

/**
 * Build the natural-language prompt + negatives.
 *
 * The hard constraint: `frame` (image === image_tail) is the untouched source
 * frame and is the splice point, so Kling is forced to open AND close on it
 * unchanged. The product therefore lives ONLY in the middle frames - it enters,
 * holds (the brand-legibility beat), then leaves so the final frame equals the
 * first. Crucially this does NOT mean a locked camera: because first === last,
 * Kling is built to move expressively and resolve home, so we *encourage* a
 * motivated camera move (push-in, orbit, parallax) on the one condition that it's
 * a CLOSED LOOP - it returns to the exact opening framing with no residual zoom
 * or drift. That "there and back" is what kills the broken-splice "weird zoom"
 * while keeping the creative motion. The prompt also keeps the product at
 * realistic scale (no frame-filling hero shot) and grounds the painted middle
 * frames in what's actually in the video (`sceneContext`, from the GPT vision
 * pass on this same frame). The brand still has to read clearly, so we name the
 * signature product + logo + colors.
 *
 * The negative prompt's first job is the motion failure mode - a move that
 * doesn't resolve (mismatched first/last frame, residual zoom, leftover drift)
 * or goes shaky. It also suppresses intrusive *overlay* text (floating
 * captions/subtitles/UI) and watermarks (NOT the product's own logo), guards
 * brand fidelity (no misspelled name, distorted logo, wrong colors, generic
 * stand-in), and fights the frame-filling/oversized + lingering-product modes.
 */
export function buildPrompt(spec: GenerationSpec): { prompt: string; negative_prompt: string } {
  const style = styleById(spec.styleId);
  const { brand } = spec;
  const placement = surfacePhrase(spec.surface);
  const scene = spec.sceneContext?.trim().replace(/[.\s]+$/, ""); // strip trailing "." so we don't double up

  const prompt = [
    `Native product-placement ad for ${brand.name}, generated inside an existing video clip.`,
    // ground the painted middle frames in the real scene
    scene ? `The scene: ${scene}.` : `Scene: ${style.sceneDescriptor}.`,
    // the hard frame constraint - clean at both ends
    `The clip begins and ends on the exact same given frame: the real scene with NO ${brand.name} product visible at the very first or very last frame.`,
    // the reveal - one continuous, fluid camera move discovers the brand; no pop-up, no static-then-animate
    `The camera is already gliding as the shot opens and smoothly looks across the scene to reveal ${brand.product} - or a big, clean version of ${brand.name}'s iconic mark - already integrated into the world ${placement}, ${style.productClause},`,
    `holding it clearly in view for a beat in the middle, then easing back to the exact opening framing so the final frame returns to the original scene exactly.`,
    // scale + branding (favor the clean icon, never spelled-out text)
    `When revealed it is big and clearly the subject, in ${brand.name}'s signature colors - its iconic symbol clean and recognizable, with no spelled-out text.`,
    // integration - continuous fluid motion, CLOSED LOOP, non-invasive
    `Continuous, fluid motion the entire time - never a frozen hold that then starts, nothing popping or spawning in the center; the brand is discovered by looking, not dropped on top of the scene.`,
    `Match the scene's lighting, lens and art style; keep it calm and non-invasive, no hard cut or transition, the surrounding scene stays consistent, so it loops seamlessly back into the source footage.`,
  ].join(" ");

  const negative_prompt =
    // NO rendered text - generated lettering comes out garbled
    "text, words, letters, caption, subtitle, signage text, gibberish text, garbled text, on-screen text overlay, ui text, watermark, " +
    // motion failure mode - continuous fluid motion that resolves back to the opening frame
    "static frozen opening frame, held frame then sudden motion, motion starting late, stutter, " +
    "object popping in, spawning, materializing in center, " +
    "camera ending on a different framing, mismatched first and last frame, residual zoom, leftover camera drift, " +
    "jarring camera motion, shaky handheld, camera shake, " +
    // brand-fidelity guards
    "distorted logo, wrong logo, wrong brand colors, motion-blurred logo, garbled logo, " +
    "generic unbranded product, off-brand knockoff, " +
    // scale / framing failure mode
    "oversized logo, logo filling the frame, brand lingering at the end, " +
    // general quality
    "extra objects, warping, morphing artifacts, flicker, abrupt cut, jump cut, scene change, distorted hands, lowres";

  return { prompt, negative_prompt };
}

/** Map a normalized surface box to a human placement phrase for the prompt. */
export function surfacePhrase(s: GenSurface): string {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const h = cx < 0.4 ? "left" : cx > 0.6 ? "right" : "center";
  const v = cy < 0.4 ? "upper" : cy > 0.66 ? "lower" : "mid";
  const where = h === "center" ? `${v} of frame` : `${v} ${h}`;
  return `on the ${s.label.toLowerCase()} (${where})`;
}

/** Strip a data URL down to bare base64 (what Kling expects), or pass a URL through. */
export function toImagePayload(frameOrUrl: string): string {
  const comma = frameOrUrl.indexOf(",");
  if (frameOrUrl.startsWith("data:") && comma !== -1) return frameOrUrl.slice(comma + 1);
  return frameOrUrl;
}

/**
 * Build the Kling request. `image` and `image_tail` are the SAME frame - this
 * is what makes the insert splice back into the source invisibly.
 *
 * model/mode are overridable from the server env; defaults are sane for a
 * first-and-last-frame image2video call.
 */
export function buildKlingRequest(
  spec: GenerationSpec,
  opts: {
    model_name?: string;
    mode?: "std" | "pro";
    cfg_scale?: number;
    /** GPT-authored prompt/negatives (see lib/promptAuthor). Falls back to buildPrompt. */
    prompt?: string;
    negative_prompt?: string;
  } = {}
): KlingRequest {
  const { prompt, negative_prompt } =
    opts.prompt && opts.negative_prompt
      ? { prompt: opts.prompt, negative_prompt: opts.negative_prompt }
      : buildPrompt(spec);
  const frame = toImagePayload(spec.frame);
  return {
    // kling-v3: Kling's flagship - more photoreal/consistent, and still supports
    // image_tail (the seamless last frame) in pro mode (verified the official
    // model_name is "kling-v3", NOT "kling-v3-0"). NB: kling-v2-1-master drops
    // image_tail - don't use it; the loop depends on it.
    model_name: opts.model_name ?? "kling-v3",
    // pro, not std: image_tail (our seamless last frame) is a pro-only feature.
    mode: opts.mode ?? "pro",
    duration: String(spec.durationSec) as "5" | "10",
    image: frame,
    image_tail: frame, // seamless: last frame === first frame
    prompt,
    negative_prompt,
    // 0.7 default (> Kling's 0.5): stricter prompt adherence so the product/logo the prompt
    // describes actually gets rendered. klingConfig() passes the env-tuned value when live.
    cfg_scale: opts.cfg_scale ?? 0.7,
  };
}

/** Replace the heavy base64 frames with a short note, for echoing back to the UI. */
export function redactKlingRequest(req: KlingRequest): KlingRequest {
  const note = (s: string) =>
    s.startsWith("http") ? s : `<base64 frame · ~${Math.round((s.length * 0.75) / 1024)} KB>`;
  return { ...req, image: note(req.image), image_tail: "<same as image · seamless first=last frame>" };
}
