/**
 * POST /api/generate — create a native-ad generation job for one selected
 * moment, routed to Kling. When Kling isn't configured we return a transparent
 * mock job (the UI falls back to the composited preview) so the whole flow runs
 * end-to-end without a key.
 */

import {
  buildKlingRequest,
  redactKlingRequest,
  statusProgress,
  type GenerationJob,
  type GenerationSpec,
} from "@/lib/generation";
import {
  createImage2Video,
  isKlingConfigured,
  klingConfig,
  KlingApiError,
} from "@/lib/providers/kling";
import { authorKlingPrompt } from "@/lib/promptAuthor";

export const runtime = "nodejs"; // node:crypto for JWT signing
export const dynamic = "force-dynamic";
export const maxDuration = 60; // GPT prompt-authoring is a vision call; give it headroom

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function isValidSpec(s: unknown): s is GenerationSpec {
  if (!s || typeof s !== "object") return false;
  const v = s as Record<string, unknown>;
  // New optional fields (Subtask 1): tolerate absence; reject only wrong shapes.
  if (v.referenceImages !== undefined && !Array.isArray(v.referenceImages)) return false;
  if (v.transcriptContext !== undefined && typeof v.transcriptContext !== "string") return false;
  return (
    typeof v.frame === "string" &&
    (v.frame.startsWith("data:") || v.frame.startsWith("http")) &&
    typeof v.styleId === "string" &&
    typeof v.brand === "object" &&
    typeof v.surface === "object" &&
    (v.durationSec === 5 || v.durationSec === 10)
  );
}

/** Encode mock job timing into an opaque, stateless token. */
function mockToken(simMs: number): string {
  return Buffer.from(JSON.stringify({ t: Date.now(), d: simMs })).toString("base64url");
}

export async function POST(request: Request) {
  let spec: unknown;
  try {
    spec = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!isValidSpec(spec)) return badRequest("invalid generation spec");

  // Have GPT look at the frame and author a Kling prompt native to THIS scene
  // (medium-matched, grounded in what's visible). Null on no-key/error → the
  // buildKlingRequest call falls back to the static buildPrompt template.
  const authored = await authorKlingPrompt({
    image: spec.frame,
    brand: spec.brand,
    styleId: spec.styleId,
    surface: spec.surface,
    scene: spec.sceneContext,
    durationSec: spec.durationSec,
  });

  // Build the real Kling request either way — env overrides on a configured
  // account, defaults otherwise — so the inspector shows exactly what we'd send.
  const cfg = isKlingConfigured() ? klingConfig() : null;
  const klingReq = buildKlingRequest(spec, {
    ...(cfg ? { model_name: cfg.model, mode: cfg.mode, cfg_scale: cfg.cfgScale } : {}),
    ...(authored ?? {}),
  });
  const redacted = redactKlingRequest(klingReq);

  if (!cfg) {
    // Mock: no key — simulate a job whose progress derives purely from elapsed time.
    const simMs = 8000 + spec.durationSec * 600;
    const job: GenerationJob = {
      id: `mock:${mockToken(simMs)}`,
      provider: "mock",
      status: "queued",
      progress: statusProgress("queued"),
      videoUrl: null,
      message: "Kling not configured — simulating. Showing composited preview.",
      request: redacted,
    };
    return Response.json({ job });
  }

  try {
    const { taskId, status } = await createImage2Video(klingReq);
    const job: GenerationJob = {
      id: `kling:${taskId}`,
      provider: "kling",
      status,
      progress: statusProgress(status),
      videoUrl: null,
      request: redacted,
    };
    return Response.json({ job });
  } catch (err) {
    const message = err instanceof KlingApiError ? err.message : "generation failed";
    const status = err instanceof KlingApiError ? err.status ?? 502 : 500;
    return Response.json({ error: message }, { status });
  }
}
