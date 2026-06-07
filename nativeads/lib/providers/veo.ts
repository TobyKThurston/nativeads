/**
 * Veo 3.1 provider adapter — SERVER ONLY (reads VEO_API_KEY / GEMINI_API_KEY).
 *
 * The default video provider for the design-file pipeline: Veo accepts up to 3
 * reference images alongside a first frame (`image`) + last frame (`last_frame`)
 * in one call — exactly Plan A (§1/§4). Auth is a Gemini API key. Video is a
 * long-running operation: create returns an operation name (our taskId), which
 * we poll until the video URI lands.
 *
 * ⚠ Veo's REST surface is preview — the endpoint, request body and response
 * field names are env-overridable and should be confirmed against the Gemini API
 * video docs when a key is wired. Until VEO_API_KEY/GEMINI_API_KEY is set,
 * isVeoConfigured() is false and /api/generate runs the mock path unchanged.
 */

import { VEO_MODEL, VEO_BASE_URL } from "../config";
import type { GenStatus, VeoRequest } from "../generation";

export class VeoApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "VeoApiError";
  }
}

/** Veo runs on the Gemini API; VEO_API_KEY falls back to GEMINI_API_KEY. */
function veoKey(): string | undefined {
  return process.env.VEO_API_KEY || process.env.GEMINI_API_KEY;
}

export function isVeoConfigured(): boolean {
  return Boolean(veoKey());
}

function authHeaders(key: string): HeadersInit {
  return { "Content-Type": "application/json", "x-goog-api-key": key };
}

/** Strip a data: prefix down to bare base64 (Veo takes inline bytes here). */
const stripData = (s: string) => {
  const c = s.indexOf(",");
  return s.startsWith("data:") && c !== -1 ? s.slice(c + 1) : s;
};

/** An inline image part for the Veo request. Mime defaults to JPEG (captureFrame). */
function imagePart(value: string) {
  return { bytesBase64Encoded: stripData(value), mimeType: "image/jpeg" };
}

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
const asArray = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined);

type VeoOperation = {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: unknown;
};

async function readJson(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      asRecord(asRecord(body)?.error)?.message ?? `Veo HTTP ${res.status}`;
    throw new VeoApiError(String(message), res.status);
  }
  return body;
}

/** Dig the finished operation for a video URI across a few known response shapes. */
function extractVideoUrl(op: VeoOperation): string | null {
  const resp = asRecord(op.response);
  if (!resp) return null;
  const candidates: unknown[] = [
    asArray(asRecord(resp.generateVideoResponse)?.generatedSamples)?.[0],
    asArray(resp.generatedVideos)?.[0],
    asArray(resp.predictions)?.[0],
    asArray(resp.videos)?.[0],
  ];
  for (const node of candidates) {
    const rec = asRecord(node);
    if (!rec) continue;
    const uri = asRecord(rec.video)?.uri ?? rec.uri ?? rec.url;
    if (typeof uri === "string" && uri) return uri;
  }
  return null;
}

/** Submit a Veo video job; returns the long-running operation name as taskId. */
export async function createVideo(req: VeoRequest): Promise<{ taskId: string; status: GenStatus }> {
  const key = veoKey();
  if (!key) throw new VeoApiError("Veo is not configured (set VEO_API_KEY or GEMINI_API_KEY)");
  const model = req.model || VEO_MODEL;
  const body = {
    instances: [
      {
        prompt: req.prompt,
        ...(req.negative_prompt ? { negativePrompt: req.negative_prompt } : {}),
        image: imagePart(req.image),
        lastFrame: imagePart(req.last_image),
        ...(req.reference_images.length
          ? {
              referenceImages: req.reference_images.map((r) => ({
                image: imagePart(r),
                referenceType: "asset",
              })),
            }
          : {}),
      },
    ],
  };
  const res = await fetch(
    `${VEO_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:predictLongRunning`,
    { method: "POST", headers: authHeaders(key), body: JSON.stringify(body), cache: "no-store" }
  );
  const data = (await readJson(res)) as { name?: string };
  if (!data?.name) throw new VeoApiError("Veo did not return an operation name");
  return { taskId: data.name, status: "processing" };
}

/** Poll a Veo operation; returns the video URL once it succeeds. */
export async function queryVideo(
  taskId: string
): Promise<{ status: GenStatus; videoUrl: string | null; message?: string }> {
  const key = veoKey();
  if (!key) throw new VeoApiError("Veo is not configured");
  const res = await fetch(`${VEO_BASE_URL}/v1beta/${taskId}`, {
    method: "GET",
    headers: authHeaders(key),
    cache: "no-store",
  });
  const data = (await readJson(res)) as VeoOperation;
  if (data?.error) return { status: "failed", videoUrl: null, message: data.error.message };
  if (!data?.done) return { status: "processing", videoUrl: null };
  const videoUrl = extractVideoUrl(data);
  return {
    status: videoUrl ? "succeeded" : "failed",
    videoUrl,
    message: videoUrl ? undefined : "Veo finished without a video",
  };
}
