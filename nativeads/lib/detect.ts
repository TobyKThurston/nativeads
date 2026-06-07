import { buildResult, type AnalysisResult, type Capture, type ScoredSurface } from "./analyze";

/**
 * Pull a REAL frame from a YouTube video at a random point via the server route
 * (yt-dlp + ffmpeg). Returns a Capture (same shape as an uploaded-file frame),
 * or null so the caller can fall back to the thumbnail.
 */
export async function fetchYouTubeFrame(id: string): Promise<Capture | null> {
  try {
    const r = await fetch("/api/frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
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
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
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
