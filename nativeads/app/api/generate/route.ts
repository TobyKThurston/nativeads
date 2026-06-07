/**
 * POST /api/generate — create a native-ad generation job for one selected
 * moment, routed to Kling. When Kling isn't configured we return a transparent
 * mock job (the UI falls back to the composited preview) so the whole flow runs
 * end-to-end without a key.
 */

import {
  buildKlingRequest,
  buildVeoRequest,
  redactKlingRequest,
  redactVeoRequest,
  statusProgress,
  type GenerationJob,
  type GenerationSpec,
  type ReferenceImage,
} from "@/lib/generation";
import {
  createImage2Video,
  isKlingConfigured,
  klingConfig,
  KlingApiError,
} from "@/lib/providers/kling";
import { createVideo, isVeoConfigured, VeoApiError } from "@/lib/providers/veo";
import {
  generateBrandFile,
  generateStyleFile,
  isImageConfigured,
} from "@/lib/providers/nanobanana";
import { videoProvider, VEO_MODEL } from "@/lib/config";
import { authorVideoPrompt } from "@/lib/promptAuthor";
import { isValidSpec } from "@/lib/specValidation";

export const runtime = "nodejs"; // node:crypto for JWT signing
export const dynamic = "force-dynamic";
export const maxDuration = 60; // GPT prompt-authoring is a vision call; give it headroom

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
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

  // Resolve design files (§2/§5): prefer client-supplied refs (cache hit, zero
  // cost), else generate via Nano Banana — brand file always, style file only on
  // non-native footage. Files we generate here are returned on the job so the
  // client can cache + reuse them across branches/regens. None → text-only.
  let referenceImages: ReferenceImage[] = spec.referenceImages ?? [];
  let generatedDesignFiles: ReferenceImage[] | undefined;
  if (referenceImages.length === 0 && isImageConfigured()) {
    const refs: ReferenceImage[] = [];
    const brandFile = await generateBrandFile({
      frame: spec.frame,
      brand: spec.brand,
      styleId: spec.styleId,
      scene: spec.sceneContext,
      transcript: spec.transcriptContext,
    });
    if (brandFile) refs.push({ kind: "brand", url: brandFile });
    if (spec.styleId !== "native") {
      const styleFile = await generateStyleFile({ frame: spec.frame, styleId: spec.styleId });
      if (styleFile) refs.push({ kind: "style", url: styleFile });
    }
    if (refs.length) {
      referenceImages = refs;
      generatedDesignFiles = refs;
    }
  }
  const specWithRefs: GenerationSpec = { ...spec, referenceImages };

  // Have GPT look at the frame (+ the brand design file, when present) and author
  // a video prompt native to THIS scene. Null on no-key/error → the build*Request
  // call falls back to the static buildPrompt template.
  const authored = await authorVideoPrompt({
    image: spec.frame,
    brand: spec.brand,
    styleId: spec.styleId,
    surface: spec.surface,
    scene: spec.sceneContext,
    durationSec: spec.durationSec,
    referenceImages,
    transcript: spec.transcriptContext,
  });

  // Choose the video provider: honor VIDEO_PROVIDER, then fall back to whichever
  // is actually configured; mock when neither is.
  const preferred = videoProvider();
  const veoReady = isVeoConfigured();
  const klingReady = isKlingConfigured();
  const useVeo = veoReady && (preferred === "veo" || !klingReady);
  const useKling = !useVeo && klingReady;

  // ── Veo (default) ──
  if (useVeo) {
    const veoReq = buildVeoRequest(specWithRefs, { model: VEO_MODEL, ...(authored ?? {}) });
    try {
      const { taskId, status } = await createVideo(veoReq);
      const job: GenerationJob = {
        id: `veo:${taskId}`,
        provider: "veo",
        status,
        progress: statusProgress(status),
        videoUrl: null,
        request: redactVeoRequest(veoReq),
        designFiles: generatedDesignFiles,
      };
      return Response.json({ job });
    } catch (err) {
      const message = err instanceof VeoApiError ? err.message : "generation failed";
      const status = err instanceof VeoApiError ? err.status ?? 502 : 500;
      return Response.json({ error: message }, { status });
    }
  }

  // ── Kling (fallback) ── note: Kling is text+frame only; it ignores design
  // files, so the product reference rides in the authored prompt for this path.
  if (useKling) {
    const cfg = klingConfig();
    const klingReq = buildKlingRequest(specWithRefs, {
      model_name: cfg.model,
      mode: cfg.mode,
      cfg_scale: cfg.cfgScale,
      ...(authored ?? {}),
    });
    try {
      const { taskId, status } = await createImage2Video(klingReq);
      const job: GenerationJob = {
        id: `kling:${taskId}`,
        provider: "kling",
        status,
        progress: statusProgress(status),
        videoUrl: null,
        request: redactKlingRequest(klingReq),
        designFiles: generatedDesignFiles,
      };
      return Response.json({ job });
    } catch (err) {
      const message = err instanceof KlingApiError ? err.message : "generation failed";
      const status = err instanceof KlingApiError ? err.status ?? 502 : 500;
      return Response.json({ error: message }, { status });
    }
  }

  // ── Mock: no provider configured — simulate a job whose progress derives
  // purely from elapsed time. Echo the would-be (default-provider) request.
  const simMs = 8000 + spec.durationSec * 600;
  const mockReq = redactVeoRequest(
    buildVeoRequest(specWithRefs, { model: VEO_MODEL, ...(authored ?? {}) })
  );
  const job: GenerationJob = {
    id: `mock:${mockToken(simMs)}`,
    provider: "mock",
    status: "queued",
    progress: statusProgress("queued"),
    videoUrl: null,
    message: "No video provider configured — simulating. Showing composited preview.",
    request: mockReq,
    designFiles: generatedDesignFiles,
  };
  return Response.json({ job });
}
