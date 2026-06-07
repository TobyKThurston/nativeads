import type { Frame } from "./types";
import { CANDIDATES } from "./surfaces";

/* ----------------------------------------------------------------------------
   Single-frame placement analysis.

   We grab ONE frame at a random point in the video and detect ad surfaces on it.
   Detection is done by GPT vision when a key is configured (see lib/detect.ts +
   /api/analyze); otherwise we fall back to a local heuristic (real pixel stats
   for files, a deterministic simulation for YouTube).
---------------------------------------------------------------------------- */

export type SurfaceMetrics = {
  area: number;       // visible area
  flatness: number;   // smoothness of the surface
  centrality: number; // closeness to frame center
  duration: number;   // likelihood it stays on screen
  nativeness: number; // likelihood of feeling native
};

export type ScoredSurface = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  score: number; // 0..1 overall placement score
  metrics: SurfaceMetrics;
  primary?: boolean;
};

export type AnalysisResult = {
  frame: Frame;          // the captured frame
  timestamp: number;     // the random point we sampled (seconds)
  duration: number;
  confidence: number;    // 0..1
  primary: ScoredSurface;
  surfaces: ScoredSurface[];
  source: "gpt" | "heuristic";
  model?: string;
  rationale?: string;
  /** GPT's short description of what's in the frame; fed to Kling as ad context. */
  scene?: string;
  /**
   * Dialogue/context near `timestamp`, produced by the Whisper transcript layer
   * (§3 seam). That layer is the producer; the generation flow is the consumer.
   * Undefined until populated — a no-op for the rest of the pipeline.
   */
  transcript?: string;
};

// ---- math helpers ----
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

export function fmtTime(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---- candidate geometry (for the heuristic + sane defaults) ----
const MAX_AREA = Math.max(...CANDIDATES.map((c) => c.w * c.h));
const GEO = CANDIDATES.map((c) => {
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  const dist = Math.hypot(cx - 0.5, cy - 0.5);
  return { area: clamp01((c.w * c.h) / MAX_AREA), centrality: clamp01(1 - dist / 0.6) };
});

/** Assemble the final result: sort surfaces, mark the primary, derive confidence. */
export function buildResult(
  frame: Frame,
  timestamp: number,
  duration: number,
  surfaces: ScoredSurface[],
  meta: { source: "gpt" | "heuristic"; model?: string; rationale?: string; scene?: string }
): AnalysisResult {
  const sorted = [...surfaces].sort((a, b) => b.score - a.score).map((s, i) => ({ ...s, primary: i === 0 }));
  const primary = sorted[0];
  const confidence = clamp(0.8 + 0.18 * (primary?.score ?? 0.6), 0.8, 0.99);
  return { frame, timestamp, duration, confidence, primary, surfaces: sorted, ...meta };
}

/** Score we rank scanned moments by — the best surface's placement score. */
const momentScore = (r: AnalysisResult) => r.primary?.score ?? r.confidence ?? 0;

/**
 * Spread `count` distinct sample timestamps across a clip's middle (8–92%), one
 * per even segment with a little jitter so repeat runs vary. When duration is
 * unknown (0, e.g. a YouTube clip we couldn't probe) we return spread second
 * guesses instead. Used to scan several frames before ranking the best moments.
 */
export function pickScanTimes(duration: number, count: number): number[] {
  if (count <= 0) return [];
  const d = isFinite(duration) && duration > 0 ? duration : 0;
  if (d <= 0) {
    return Array.from({ length: count }, (_, i) => Math.round(8 + i * 17 + Math.random() * 6));
  }
  const lo = d * 0.08;
  const seg = (d * 0.92 - lo) / count;
  return Array.from({ length: count }, (_, i) => {
    const base = lo + seg * (i + 0.5) + (Math.random() - 0.5) * seg * 0.6;
    return clamp(base, 0.05, Math.max(0.05, d - 0.05));
  });
}

/**
 * Pick the top `n` moments by placement score, skipping any that sit within
 * `minGapSec` of an already-chosen moment so the cuts don't all land on the same
 * beat. Backfills from the remainder if dedupe leaves us short, then returns them
 * ordered by timestamp so cut 1 → 3 follows the video timeline.
 */
export function rankTopMoments(
  results: AnalysisResult[],
  n: number,
  minGapSec = 1.5
): AnalysisResult[] {
  const ranked = [...results].sort((a, b) => momentScore(b) - momentScore(a));
  const chosen: AnalysisResult[] = [];
  for (const r of ranked) {
    if (chosen.length >= n) break;
    if (chosen.some((c) => Math.abs(c.timestamp - r.timestamp) < minGapSec)) continue;
    chosen.push(r);
  }
  for (const r of ranked) {
    if (chosen.length >= n) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  return chosen.sort((a, b) => a.timestamp - b.timestamp);
}

function seekTo(v: HTMLVideoElement, t: number) {
  return new Promise<void>((res) => {
    let done = false;
    const ok = () => { if (done) return; done = true; v.removeEventListener("seeked", ok); res(); };
    v.addEventListener("seeked", ok);
    try { v.currentTime = t; } catch { ok(); }
    setTimeout(ok, 700);
  });
}

export type Capture = { image: string; t: number; duration: number; aspect: number };

/** Grab a frame at a random point (default) from an uploaded file, downscaled for upload. */
export function captureFrame(url: string, atTime?: number): Promise<Capture> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.src = url;

    v.addEventListener("error", () => reject(new Error("decode")), { once: true });
    v.addEventListener("loadedmetadata", async () => {
      const duration = v.duration && isFinite(v.duration) ? v.duration : 4;
      const vw = v.videoWidth || 1280;
      const vh = v.videoHeight || 720;
      const aspect = vw / vh;
      const t = atTime ?? clamp(duration * (0.1 + Math.random() * 0.8), 0.05, Math.max(0.05, duration - 0.05));
      await seekTo(v, t);
      try {
        const maxW = 1024;
        const cw = Math.min(maxW, vw);
        const ch = Math.round(cw / aspect);
        const canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        canvas.getContext("2d")!.drawImage(v, 0, 0, cw, ch);
        const image = canvas.toDataURL("image/jpeg", 0.82);
        v.removeAttribute("src"); v.load();
        resolve({ image, t, duration, aspect });
      } catch (e) {
        reject(e);
      }
    }, { once: true });
  });
}

/** Local heuristic detection over a captured frame's real pixels (file path). */
export async function heuristicFromImage(cap: Capture): Promise<AnalysisResult> {
  const img = await loadImage(cap.image);
  const SW = 192;
  const SH = Math.max(2, Math.round(SW / cap.aspect));
  const canvas = document.createElement("canvas");
  canvas.width = SW; canvas.height = SH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, SW, SH);
  const data = ctx.getImageData(0, 0, SW, SH).data;

  const surfaces: ScoredSurface[] = CANDIDATES.map((c, ci) => {
    const x0 = Math.floor(c.x * SW), y0 = Math.floor(c.y * SH);
    const x1 = Math.min(SW, Math.ceil((c.x + c.w) * SW)), y1 = Math.min(SH, Math.ceil((c.y + c.h) * SH));
    let n = 0, sum = 0, sumsq = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * SW + x) * 4;
        const L = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
        sum += L; sumsq += L * L; n++;
      }
    }
    const meanL = n ? sum / n : 0;
    const variance = n ? Math.max(0, sumsq / n - meanL * meanL) : 1;
    const flatness = clamp01(1 - variance / 0.025);
    const midtone = clamp01(1 - Math.abs(meanL - 0.5) * 1.6);
    const { area, centrality } = GEO[ci];
    const nativeness = clamp01(0.5 * flatness + 0.2 * area + 0.15 * centrality + 0.15 * midtone);
    const score = clamp01(0.3 * flatness + 0.16 * area + 0.18 * centrality + 0.1 * midtone + 0.26 * nativeness);
    return {
      id: c.id, label: c.label, x: c.x, y: c.y, w: c.w, h: c.h, score,
      metrics: { area, flatness, centrality, duration: clamp01(0.4 + 0.6 * flatness), nativeness },
    };
  });

  return buildResult({ url: cap.image, aspect: cap.aspect }, cap.t, cap.duration, surfaces, { source: "heuristic" });
}

/** Deterministic heuristic for YouTube (iframe pixels aren't readable). */
export function heuristicYouTube(thumb: string, seedStr: string, timestamp: number): AnalysisResult {
  const seed = hash(seedStr);
  const surfaces: ScoredSurface[] = CANDIDATES.map((c, ci) => {
    const f = fract(seed * 0.0007 + ci * 0.137);
    const flatness = clamp01(0.45 + 0.4 * Math.sin(f * 6.283) + (ci === 0 ? 0.2 : ci === 2 ? 0.1 : 0));
    const midtone = clamp01(0.55 + 0.3 * Math.sin(f * 3.1));
    const { area, centrality } = GEO[ci];
    const nativeness = clamp01(0.5 * flatness + 0.2 * area + 0.15 * centrality + 0.15 * midtone);
    const score = clamp01(0.3 * flatness + 0.16 * area + 0.18 * centrality + 0.1 * midtone + 0.26 * nativeness);
    return {
      id: c.id, label: c.label, x: c.x, y: c.y, w: c.w, h: c.h, score,
      metrics: { area, flatness, centrality, duration: clamp01(0.4 + 0.6 * flatness), nativeness },
    };
  });
  return buildResult({ url: thumb, aspect: 16 / 9 }, timestamp, 0, surfaces, { source: "heuristic" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img load"));
    img.src = src;
  });
}

/** FNV-1a hash → non-negative int. Reused by the design-file cache (store.ts). */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
const fract = (x: number) => x - Math.floor(x);
