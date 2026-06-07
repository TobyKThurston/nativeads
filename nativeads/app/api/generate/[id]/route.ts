/**
 * GET /api/generate/[id] - poll a generation job.
 *   kling:<taskId>  → query Kling for status + video url
 *   mock:<token>    → derive progress from elapsed time encoded in the token
 */

import { statusProgress, type GenStatus, type GenerationJob } from "@/lib/generation";
import { queryImage2Video, KlingApiError } from "@/lib/providers/kling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function pollMock(token: string): GenerationJob {
  let t = 0;
  let d = 10000;
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString());
    t = Number(decoded.t) || 0;
    d = Number(decoded.d) || 10000;
  } catch {
    /* fall through to defaults */
  }
  const progress = t ? clamp01((Date.now() - t) / d) : 1;
  const status: GenStatus = progress >= 1 ? "succeeded" : progress > 0.1 ? "processing" : "queued";
  return {
    id: `mock:${token}`,
    provider: "mock",
    status,
    progress,
    videoUrl: null, // mock produces no media - the UI keeps showing the composite
    message:
      status === "succeeded"
        ? "Mock complete - wire KLING_ACCESS_KEY / KLING_SECRET_KEY to render for real."
        : "Simulating Kling render…",
  };
}

async function pollKling(taskId: string): Promise<GenerationJob> {
  const { status, videoUrl, message } = await queryImage2Video(taskId);
  return {
    id: `kling:${taskId}`,
    provider: "kling",
    status,
    progress: status === "processing" && videoUrl ? 0.9 : statusProgress(status),
    videoUrl,
    message,
  };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sep = id.indexOf(":");
  const provider = sep === -1 ? "" : id.slice(0, sep);
  const ref = sep === -1 ? "" : id.slice(sep + 1);

  if (provider === "mock") return Response.json({ job: pollMock(ref) });

  if (provider === "kling") {
    try {
      return Response.json({ job: await pollKling(ref) });
    } catch (err) {
      const message = err instanceof KlingApiError ? err.message : "poll failed";
      const status = err instanceof KlingApiError ? err.status ?? 502 : 500;
      return Response.json({ error: message }, { status });
    }
  }

  return Response.json({ error: "unknown job id" }, { status: 400 });
}
