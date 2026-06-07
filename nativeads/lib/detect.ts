import { buildResult, type AnalysisResult, type Capture, type ScoredSurface } from "./analyze";

// Both scanning calls hit the network (yt-dlp+ffmpeg, then GPT vision) and have
// a long, unpredictable tail. We cap each one so the step stays snappy: on a
// timeout we abort the request and fall back to the fast path (thumbnail /
// local heuristic) instead of letting the user wait the server's full 60s.
const FRAME_TIMEOUT_MS = 8000; // yt-dlp+ffmpeg → thumbnail fallback
const ANALYZE_TIMEOUT_MS = 12000; // GPT vision → local heuristic fallback

/** fetch() that aborts itself after `ms`, so a slow tail can't stall the UI. */
async function fetchWithTimeout(input: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull a REAL frame from a YouTube video at a random point via the server route
 * (yt-dlp + ffmpeg). Returns a Capture (same shape as an uploaded-file frame),
 * or null so the caller can fall back to the thumbnail.
 */
export async function fetchYouTubeFrame(id: string): Promise<Capture | null> {
  try {
    const r = await fetchWithTimeout(
      "/api/frame",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      },
      FRAME_TIMEOUT_MS
    );
    const d = (await r.json()) as { ok: boolean; image?: string; t?: number; duration?: number };
    if (!d.ok || !d.image) return null;
    const aspect = await imageAspect(d.image).catch(() => 16 / 9);
    return { image: d.image, t: d.t ?? 0, duration: d.duration ?? 0, aspect };
  } catch {
    return null;
  }
}

function imageAspect(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 16 / 9);
    img.onerror = () => reject(new Error("img"));
    img.src = src;
  });
}

/**
 * Ask the server route (which holds the OpenAI key) to detect ad surfaces in a
 * single frame. Returns a full AnalysisResult, or null if GPT is unavailable
 * (no key, error) so the caller can fall back to the local heuristic.
 */
export async function requestGptDetection(
  image: string,
  ctx: { timestamp: number; duration: number; aspect: number }
): Promise<AnalysisResult | null> {
  try {
    const r = await fetchWithTimeout(
      "/api/analyze",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      },
      ANALYZE_TIMEOUT_MS
    );
    const data = (await r.json()) as
      | { ok: true; surfaces: ScoredSurface[]; model?: string; rationale?: string; scene?: string }
      | { ok: false; reason?: string };

    if (!data.ok || !data.surfaces?.length) return null;

    return buildResult(
      { url: image, aspect: ctx.aspect },
      ctx.timestamp,
      ctx.duration,
      data.surfaces,
      { source: "gpt", model: data.model, rationale: data.rationale, scene: data.scene }
    );
  } catch {
    return null;
  }
}
