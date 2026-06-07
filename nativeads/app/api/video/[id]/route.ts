/**
 * GET /api/video/[id] — same-origin proxy for Veo-generated videos.
 *
 * Veo returns its result as a Gemini Files URL
 * (…/v1beta/files/<id>:download?alt=media) that is AUTH-GATED: fetching it
 * requires the `x-goog-api-key` header. A browser <video src> can't send that
 * header, so it 403s and nothing plays. We proxy the download here: the server
 * attaches GEMINI_API_KEY (never exposed to the client) and streams the bytes
 * back. Range requests are forwarded so the player can seek.
 *
 * SSRF guard: only a bare file id (alphanumeric/_/-) is accepted — the upstream
 * URL is reconstructed server-side, so no caller-controlled host/path is fetched.
 */

import { GEMINI_BASE_URL } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_ID = /^[A-Za-z0-9_-]+$/;
const PASS_THROUGH = ["content-type", "content-length", "content-range", "accept-ranges"] as const;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!FILE_ID.test(id)) {
    return Response.json({ error: "invalid file id" }, { status: 400 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ error: "video proxy not configured (set GEMINI_API_KEY)" }, { status: 503 });
  }

  const upstream = `${GEMINI_BASE_URL}/v1beta/files/${id}:download?alt=media`;
  const headers: Record<string, string> = { "x-goog-api-key": key };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let res: Response;
  try {
    res = await fetch(upstream, { headers, redirect: "follow", cache: "no-store" });
  } catch {
    return Response.json({ error: "video fetch failed" }, { status: 502 });
  }
  if (!res.ok && res.status !== 206) {
    const status = res.status === 404 ? 404 : 502;
    return Response.json({ error: `upstream returned ${res.status}` }, { status });
  }

  const out = new Headers();
  for (const h of PASS_THROUGH) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has("content-type")) out.set("content-type", "video/mp4");
  out.set("Cache-Control", "private, max-age=3600");

  return new Response(res.body, { status: res.status, headers: out });
}
