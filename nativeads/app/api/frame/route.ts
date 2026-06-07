import { execFile } from "node:child_process";
import { promisify } from "node:util";

// yt-dlp + ffmpeg can take several seconds to resolve + seek.
export const runtime = "nodejs";
export const maxDuration = 60;

const run = promisify(execFile);

/**
 * Format ladder, highest quality first. A single frame needs no audio, so we
 * pull the best VIDEO-ONLY stream — that unlocks 1080p (YouTube only muxes
 * audio+video up to 720p). avc1 (H.264) is preferred first: it decodes fastest
 * and most reliably; vp9/av1 at the same resolution are visually equivalent and
 * serve as the next rung. The muxed ≤720p path is the final, proven fallback so
 * we degrade to a slightly smaller real frame rather than all the way to the
 * thumbnail if a video-only DASH stream can't be seeked.
 */
const FORMAT_LADDER = [
  "bv*[height<=1080][vcodec^=avc1]/bv*[height<=1080]/bestvideo[height<=1080]",
  "best[height<=720]/best",
];

/**
 * Resolve `format` to a direct stream URL and grab one frame at `t` as a
 * LOSSLESS PNG (rgb24, no chroma subsampling) at the stream's native
 * resolution — no downscale, no JPEG artifacts. Fast input seek (`-ss` before
 * `-i`) lands on the nearest keyframe, which is also the cleanest possible
 * frame (a full I-frame, free of inter-frame prediction artifacts). Returns the
 * PNG buffer, or null so the caller can try the next rung of the ladder.
 */
async function grabFrame(url: string, format: string, t: number): Promise<Buffer | null> {
  try {
    const { stdout: urls } = await run(
      "yt-dlp",
      ["--no-warnings", "--no-playlist", "-f", format, "-g", url],
      { timeout: 30000 }
    );
    const stream = urls.split("\n").map((s) => s.trim()).filter(Boolean)[0];
    if (!stream) return null;

    const { stdout } = await run(
      "ffmpeg",
      [
        "-nostdin",
        "-loglevel", "error",
        "-ss", String(t),
        "-i", stream,
        "-frames:v", "1",
        "-an",
        "-pix_fmt", "rgb24",
        "-c:v", "png",
        "-f", "image2pipe",
        "pipe:1",
      ],
      { timeout: 45000, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" }
    );

    const buf = stdout as unknown as Buffer;
    return buf && buf.length >= 1000 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Extract a REAL frame from a YouTube video at a timestamp (random if omitted).
 * An embedded player is cross-origin, so the browser can't screenshot it — we
 * resolve the stream with yt-dlp and grab the frame with ffmpeg, server-side.
 * Returns { ok:false } on any failure so the client can fall back to the thumbnail.
 */
export async function POST(req: Request) {
  let body: { id?: string; t?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const id = body.id;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return Response.json({ ok: false, reason: "bad_id" }, { status: 400 });
  }
  const url = `https://www.youtube.com/watch?v=${id}`;

  try {
    // 1 — duration (so we can pick a sensible random point)
    let duration = 0;
    try {
      const { stdout } = await run("yt-dlp", ["--no-warnings", "--no-playlist", "--print", "duration", url], { timeout: 30000 });
      duration = parseFloat(stdout.trim()) || 0;
    } catch {
      /* keep 0 */
    }

    const t =
      typeof body.t === "number" && isFinite(body.t) && body.t >= 0
        ? body.t
        : duration > 2
          ? Math.round((0.1 + Math.random() * 0.8) * duration)
          : 1;

    // 2 — grab the highest-quality frame the format ladder yields (best
    // video-only ≤1080p as a lossless PNG; muxed ≤720p as the last resort).
    let buf: Buffer | null = null;
    for (const format of FORMAT_LADDER) {
      buf = await grabFrame(url, format, t);
      if (buf) break;
    }
    if (!buf) return Response.json({ ok: false, reason: "empty_frame" }, { status: 200 });

    const image = `data:image/png;base64,${buf.toString("base64")}`;
    return Response.json({ ok: true, image, t, duration });
  } catch (e) {
    const msg = String(e);
    const reason = msg.includes("ENOENT") ? "ytdlp_missing" : "extract_failed";
    return Response.json({ ok: false, reason, detail: msg.slice(0, 300) }, { status: 200 });
  }
}
