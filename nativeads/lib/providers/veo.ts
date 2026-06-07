/**
 * Veo 3.1 provider adapter — SERVER ONLY (reads GEMINI_API_KEY).
 *
 * The default video provider for the design-file pipeline. Veo and Nano Banana
 * are both Gemini-family models on the same Gemini API, so they share ONE
 * credential (GEMINI_API_KEY); auth is an API key. Video is a long-running
 * operation: create returns an operation name (our taskId), which we poll until
 * the URI lands.
 *
 * ⚠ Verified against the live Gemini API (June 2026): two hard constraints drive
 * the request shape below —
 *   (a) images use `{ bytesBase64Encoded, mimeType }`; `inlineData` is rejected.
 *   (b) first/last-frame mode and reference-image mode are mutually exclusive in
 *       one call. We keep the seamless first===last frame and run Plan B (product
 *       via the prompt), so `reference_images` is intentionally not sent. See
 *       createVideo for the full rationale.
 * Until GEMINI_API_KEY is set, isVeoConfigured() is false and /api/generate runs
 * the mock path unchanged.
 */

import { VEO_MODEL, VEO_BASE_URL } from "../config";
import type { GenStatus, VeoRequest } from "../generation";

export class VeoApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "VeoApiError";
  }
}

/** Veo and Nano Banana are both Gemini-family models → one shared credential. */
function veoKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

export function isVeoConfigured(): boolean {
  return Boolean(veoKey());
}

function authHeaders(key: string): HeadersInit {
  return { "Content-Type": "application/json", "x-goog-api-key": key };
}

/**
 * Build a Gemini Veo image part from a data URL, http URL, or bare base64.
 *
 * ⚠ Verified against the live Gemini API (June 2026): Veo on
 * generativelanguage.googleapis.com expects the Vertex-style
 * `{ bytesBase64Encoded, mimeType }` shape and REJECTS `{ inlineData: … }`
 * outright ("`inlineData` isn't supported by this model"). Mime is preserved
 * from the data URL / response so PNG frames aren't mislabeled as JPEG.
 */
async function encodeImage(
  value: string
): Promise<{ bytesBase64Encoded: string; mimeType: string }> {
  if (value.startsWith("data:")) {
    const comma = value.indexOf(",");
    const mimeType = value.slice(5, comma).split(";")[0] || "image/jpeg";
    return { bytesBase64Encoded: value.slice(comma + 1), mimeType };
  }
  if (value.startsWith("http")) {
    const r = await fetch(value);
    const mimeType = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    return { bytesBase64Encoded: buf.toString("base64"), mimeType };
  }
  return { bytesBase64Encoded: value, mimeType: "image/jpeg" }; // bare base64
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

/**
 * Rewrite a Gemini Files download URL to our same-origin proxy so the browser
 * can play it without the API key (see app/api/video/[id]). Non-Gemini URLs
 * (should any response shape return a public one) pass through unchanged.
 */
function toPlayableUrl(uri: string): string {
  const m = uri.match(/\/files\/([^:?/]+)/);
  return m ? `/api/video/${m[1]}` : uri;
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

/**
 * Submit a Veo video job; returns the long-running operation name as taskId.
 *
 * One request = ONE video (single `instances` entry). Veo 3.1 preview caps the
 * number of videos per request — do NOT batch multiple cuts into one call here;
 * dispatch them as separate, rate-limited requests (see Previews.runGeneration).
 */
export async function createVideo(req: VeoRequest): Promise<{ taskId: string; status: GenStatus }> {
  const key = veoKey();
  if (!key) throw new VeoApiError("Veo is not configured (set GEMINI_API_KEY)");
  const model = req.model || VEO_MODEL;

  // image === last_image (seamless splice) — encode once, reuse for both.
  const image = await encodeImage(req.image);
  const lastFrame = req.last_image === req.image ? image : await encodeImage(req.last_image);

  // ⚠ Plan B (verified live, June 2026): veo-3.1-generate-preview supports
  // first/last-frame mode XOR reference-image mode — a request carrying BOTH
  // `image`/`lastFrame` AND `referenceImages` is rejected ("Unsupported video
  // generation request"). The seamless loop REQUIRES image===lastFrame pinned to
  // the source frame, so we keep the frames and deliberately DROP req.reference_images
  // here. The product enters via the GPT-authored prompt instead (the design
  // files still ground prompt authoring upstream; they're just not sent as pixels).
  //
  // Gemini video shape: per-frame inputs in `instances`, generation config in
  // `parameters` (negativePrompt belongs here, not in the instance).
  const body = {
    instances: [{ prompt: req.prompt, image, lastFrame }],
    ...(req.negative_prompt ? { parameters: { negativePrompt: req.negative_prompt } } : {}),
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
  const raw = extractVideoUrl(data);
  // Serve via our key-attaching proxy — the raw Gemini URL is auth-gated and a
  // browser <video> can't fetch it directly.
  const videoUrl = raw ? toPlayableUrl(raw) : null;
  return {
    status: videoUrl ? "succeeded" : "failed",
    videoUrl,
    message: videoUrl ? undefined : "Veo finished without a video",
  };
}
