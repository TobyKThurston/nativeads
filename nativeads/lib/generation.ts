/**
 * Generation core — isomorphic (no node/browser-only imports).
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

/**
 * A design-file reference image handed to the video model alongside the clean
 * source frame. The product/logo lives HERE (and in the prompt), never in the
 * anchor frame — so the first === last splice invariant is preserved. See §2/§4.
 */
export type ReferenceImage = {
  kind: "brand" | "style" | "logo";
  /** data URL or http URL */
  url: string;
};

/** Everything needed to generate one native cut. Sent to POST /api/generate. */
export type GenerationSpec = {
  brand: Brand;
  surface: GenSurface;
  styleId: StyleId;
  /** the captured moment, as a data URL — used for BOTH first and last frame */
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
  /**
   * Design-file references (brand, optional style) for the video model. The
   * product/logo enters the clip through these, not the anchor pixels. §2/§4.
   */
  referenceImages?: ReferenceImage[];
  /**
   * Windowed dialogue/context near `timestamp`, produced by the Whisper layer
   * and copied from AnalysisResult.transcript at spec-build time. §3 seam — a
   * no-op until populated.
   */
  transcriptContext?: string;
};

export const DURATIONS = [5, 10] as const;

/** The exact body we POST to Kling's image2video endpoint. */
export type KlingRequest = {
  model_name: string;
  mode: "std" | "pro";
  duration: "5" | "10";
  /** first frame — base64 (no data: prefix) or a URL */
  image: string;
  /** last frame — identical to `image` for a seamless splice */
  image_tail: string;
  prompt: string;
  negative_prompt: string;
  cfg_scale: number;
};

/**
 * Provider-agnostic video request for Veo 3.1, sitting beside KlingRequest.
 * `image` and `last_image` are the SAME clean source frame (seamless splice);
 * the product/logo arrives via `reference_images` + prompt. See Subtask 4.
 */
export type VeoRequest = {
  model: string;
  prompt: string;
  negative_prompt?: string;
  /** first frame — bare/encoded clean source frame */
  image: string;
  /** last frame — identical to `image` for a seamless splice */
  last_image: string;
  /** design-file reference images (brand, [style]) as data/http URLs */
  reference_images: string[];
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
  id: string; // "veo:<taskId>" | "kling:<taskId>" | "mock:<token>"
  provider: "veo" | "kling" | "mock";
  status: GenStatus;
  progress: number; // 0..1
  videoUrl: string | null;
  message?: string;
  /** redacted echo of the provider request, for the UI inspector */
  request?: KlingRequest | VeoRequest;
  /**
   * Design files the server generated for this job (brand, optional style), so
   * the client can cache them (store.ts) and reuse across branches/regens. Only
   * set when the server generated them; omitted when the client supplied refs. §5
   */
  designFiles?: ReferenceImage[];
};

/**
 * Build the natural-language prompt + negatives.
 *
 * The hard constraint: `frame` (image === image_tail) is the untouched source
 * frame and is the splice point, so Kling is forced to open AND close on it
 * unchanged. The product therefore lives ONLY in the middle frames — it has to
 * materialize into the scene, hold, then ease back out so the final frame equals
 * the first. The prompt's job is to describe exactly that arc (so the transition
 * is smooth, not a snap), keep the product at realistic scale (no frame-filling
 * hero shot), and ground the painted middle frames in what's actually in the
 * video (`sceneContext`, from the GPT vision pass on this same frame). The brand
 * still has to read clearly, so we name the signature product + logo + colors.
 *
 * The negative prompt suppresses intrusive *overlay* text (floating
 * captions/subtitles/UI) and watermarks (NOT the product's own logo), guards
 * brand fidelity (no misspelled name, distorted logo, wrong colors, generic
 * stand-in), and fights the frame-filling/oversized failure mode.
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
    // the hard frame constraint — clean at both ends
    `The clip begins and ends on the exact same given frame: the real scene with NO ${brand.name} product visible at the very first or very last frame.`,
    // the arc — product lives only in the middle, then eases out
    `Only in between, ${brand.product} appears and blends into the scene naturally ${placement} — ${style.productClause} — as if it had always belonged there,`,
    `then eases back out so the final frame returns to the original scene exactly.`,
    // scale + branding
    `Realistic scale: it sits within the scene and never fills or dominates the frame.`,
    `${brand.name}'s branding stays clear and legible: ${brand.logo}, in ${brand.name}'s signature colors.`,
    // integration
    `Match the scene's lighting, lens and art style with subtle, believable motion — no camera cut, no transition, the surrounding scene never changes, so it loops seamlessly back into the source footage.`,
  ].join(" ");

  const negative_prompt =
    // intrusive overlays that break the native illusion (but NOT the product's own logo)
    "floating caption, subtitle, on-screen text overlay, ui overlay, watermark, " +
    // brand-fidelity guards
    "misspelled brand name, garbled lettering, distorted logo, wrong logo, wrong brand colors, " +
    "generic unbranded product, off-brand knockoff, " +
    // scale / framing failure mode
    "oversized product, product filling the frame, product covering the background, " +
    // general quality
    "extra objects, duplicated product, warping, morphing artifacts, flicker, abrupt cut, scene change, camera shake, distorted hands, lowres";

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
 * Build the Kling request. `image` and `image_tail` are the SAME frame — this
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
    // kling-v3: Kling's flagship — more photoreal/consistent, and still supports
    // image_tail (the seamless last frame) in pro mode (verified the official
    // model_name is "kling-v3", NOT "kling-v3-0"). NB: kling-v2-1-master drops
    // image_tail — don't use it; the loop depends on it.
    model_name: opts.model_name ?? "kling-v3",
    // pro, not std: image_tail (our seamless last frame) is a pro-only feature.
    mode: opts.mode ?? "pro",
    duration: String(spec.durationSec) as "5" | "10",
    image: frame,
    image_tail: frame, // seamless: last frame === first frame
    prompt,
    negative_prompt,
    cfg_scale: opts.cfg_scale ?? 0.5,
  };
}

/** Replace the heavy base64 frames with a short note, for echoing back to the UI. */
export function redactKlingRequest(req: KlingRequest): KlingRequest {
  const note = (s: string) =>
    s.startsWith("http") ? s : `<base64 frame · ~${Math.round((s.length * 0.75) / 1024)} KB>`;
  return { ...req, image: note(req.image), image_tail: "<same as image · seamless first=last frame>" };
}

/**
 * Build the Veo request. `image` and `last_image` are the SAME clean source
 * frame (seamless splice); the product/logo enters via `reference_images` (the
 * design files) + prompt — never the anchor pixels. Prompt comes from the
 * GPT-authored pair when provided, else the buildPrompt template.
 */
export function buildVeoRequest(
  spec: GenerationSpec,
  opts: { model?: string; prompt?: string; negative_prompt?: string } = {}
): VeoRequest {
  const { prompt, negative_prompt } =
    opts.prompt && opts.negative_prompt
      ? { prompt: opts.prompt, negative_prompt: opts.negative_prompt }
      : buildPrompt(spec);
  const frame = toImagePayload(spec.frame);
  return {
    model: opts.model ?? "veo-3.1-generate-preview",
    prompt,
    negative_prompt,
    image: frame,
    last_image: frame, // seamless: last frame === first frame
    reference_images: (spec.referenceImages ?? []).map((r) => r.url),
  };
}

/** Redact the heavy base64 frames + reference images for the UI inspector. */
export function redactVeoRequest(req: VeoRequest): VeoRequest {
  const kb = (s: string) => Math.round((s.length * 0.75) / 1024);
  const note = (s: string) => (s.startsWith("http") ? s : `<base64 frame · ~${kb(s)} KB>`);
  return {
    ...req,
    image: note(req.image),
    last_image: "<same as image · seamless first=last frame>",
    reference_images: req.reference_images.map((r, i) =>
      r.startsWith("http") ? r : `<ref ${i} · ~${kb(r)} KB>`
    ),
  };
}
