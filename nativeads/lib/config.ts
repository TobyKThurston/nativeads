/**
 * Central configuration for the design-file pipeline (image + video models).
 *
 * Everything here is a single, swappable string sourced from the environment
 * with a sane default, mirroring lib/providers/kling.ts. Reading process.env in
 * this isomorphic module is safe: on the client only NEXT_PUBLIC_* are defined,
 * the rest are undefined and fall back to the defaults below (the server reads
 * the real values).
 *
 * ── Notes (Subtask 0; corrected June 2026 against the live Gemini API) ──
 *  1. Veo 3.1 (`veo-3.1-generate-preview`) supports first/last-frame mode XOR
 *     reference-image mode — a single call carrying BOTH `image`/`lastFrame` AND
 *     `referenceImages` is rejected ("Unsupported video generation request").
 *     The seamless loop needs image===lastFrame pinned to the source frame, so we
 *     run Plan B: send only the frames and let the product enter via the GPT-
 *     authored prompt (design files ground prompt authoring, not Veo pixels). See
 *     lib/providers/veo.ts. (Plan A — combining the two — is NOT possible here.)
 *  2. Nano Banana (image) and Veo (video) are BOTH Gemini-family models on the
 *     same Gemini API, so they share ONE credential: GEMINI_API_KEY. Auth is an
 *     API key (no JWT/SA). All ids are *preview* — env-overridable, never assume.
 */

/* ----------------------------------------------------------------- image (NB) */

/**
 * Nano Banana (image) model id, swappable via IMAGE_MODEL.
 * TODO confirm exact Gemini image model id (do not guess) — preview ids drift;
 * verify against the Gemini API image-generation docs before relying on it.
 */
export const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";

/** Gemini REST base (shared by Nano Banana + Veo). */
export const GEMINI_BASE_URL = (
  process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"
).replace(/\/+$/, "");

/* --------------------------------------------------------------- video model */

export type VideoProvider = "veo" | "kling";

/**
 * Which video provider to route to. Default "veo" (reference-image support).
 * The /api/generate route still falls back to mock when the chosen provider has
 * no keys configured (see Subtask 4).
 */
export function videoProvider(): VideoProvider {
  return process.env.VIDEO_PROVIDER === "kling" ? "kling" : "veo";
}

/** Veo model id (confirmed against Vertex/Gemini docs); env-overridable. */
export const VEO_MODEL = process.env.VEO_MODEL || "veo-3.1-generate-preview";

/** Veo REST base; defaults to the shared Gemini endpoint. */
export const VEO_BASE_URL = (
  process.env.VEO_BASE_URL || GEMINI_BASE_URL
).replace(/\/+$/, "");

/* ----------------------------------------------------- preview rate limiting */

/**
 * Gemini request budget (requests/min). Veo 3.1 preview has LOW per-project caps
 * (~10 RPM, plus a cap on videos per request) that vary by tier — firing every
 * cut at once trips them. The client (Previews) staggers dispatch to stay under
 * this. NEXT_PUBLIC_ so the browser dispatch can read it; raise it for snappier
 * dev on a higher-tier key.
 */
export const GEMINI_RPM = (() => {
  const n = parseInt(process.env.NEXT_PUBLIC_GEMINI_RPM ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
})();

/** Max design+video generations in flight at once (preview caps are low). */
export const GEN_MAX_IN_FLIGHT = 2;
