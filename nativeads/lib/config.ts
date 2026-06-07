/**
 * Central configuration for the design-file pipeline (image + video models).
 *
 * Everything here is a single, swappable string sourced from the environment
 * with a sane default, mirroring lib/providers/kling.ts. Reading process.env in
 * this isomorphic module is safe: on the client only NEXT_PUBLIC_* are defined,
 * the rest are undefined and fall back to the defaults below (the server reads
 * the real values).
 *
 * ── Verification findings (Subtask 0; confirmed against Google AI docs) ──
 *  1. Veo 3.1 (`veo-3.1-generate-preview`) accepts `reference_images` (up to 3)
 *     AND a first frame (`image`) + `last_frame` in the SAME GenerateVideosConfig
 *     call → we use Plan A (combine). lib/providers/veo.ts keeps Plan B (design
 *     file as GPT prompt grounding only) documented as the fallback.
 *  2. Nano Banana Pro = `gemini-3-pro-image-preview` (best logo/text fidelity,
 *     up to 14 input images); NB2 (faster) = `gemini-3.1-flash-image-preview`.
 *     Both via `…/v1beta/models/<model>:generateContent`.
 *  3. Both Veo and Nano Banana are the Gemini API → API-key auth (no JWT/SA).
 *     Endpoints/ids are *preview* — keep them env-overridable, never hard-assume.
 */

/* ----------------------------------------------------------------- image (NB) */

/**
 * Nano Banana model id. Default: Pro (logo/text fidelity). Swap to NB2 for speed
 * via IMAGE_MODEL=gemini-3.1-flash-image-preview (see .env.example).
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

/** Veo model id. Preview — env-overridable. */
export const VEO_MODEL = process.env.VEO_MODEL || "veo-3.1-generate-preview";

/** Veo REST base; defaults to the shared Gemini endpoint. */
export const VEO_BASE_URL = (
  process.env.VEO_BASE_URL || GEMINI_BASE_URL
).replace(/\/+$/, "");
