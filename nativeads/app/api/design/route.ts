/**
 * POST /api/design — generate a single design file via Nano Banana (§2/§6).
 *   { kind: "brand", frame, brandId, styleId, transcript? } → brand product reference
 *   { kind: "style", frame, styleId }                       → per-video style plate
 *
 * Returns { url: dataUrl | null }. The client (lib/designClient) caches the
 * result and passes it into /api/generate as a reference image, so the style
 * file is generated once and shared across the three brand cuts. No GEMINI_API_KEY
 * → { url: null }, and the whole pipeline proceeds text-only exactly as before.
 */

import { brandById } from "@/lib/brands";
import {
  generateBrandFile,
  generateStyleFile,
  isImageConfigured,
} from "@/lib/providers/nanobanana";
import type { StyleId } from "@/lib/style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Nano Banana is an image-gen round trip

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Graceful: no key → text-only, no design file.
  if (!isImageConfigured()) return Response.json({ url: null });

  const frame = body.frame;
  if (typeof frame !== "string" || !(frame.startsWith("data:") || frame.startsWith("http"))) {
    return Response.json({ error: "invalid frame" }, { status: 400 });
  }
  const styleId = (typeof body.styleId === "string" ? body.styleId : "native") as StyleId;

  if (body.kind === "style") {
    const url = await generateStyleFile({ frame, styleId });
    return Response.json({ url });
  }

  if (body.kind === "brand") {
    const brand = brandById(String(body.brandId));
    if (!brand) return Response.json({ error: "unknown brand" }, { status: 400 });
    const transcript = typeof body.transcript === "string" ? body.transcript : undefined;
    const url = await generateBrandFile({ frame, brand, styleId, transcript });
    return Response.json({ url });
  }

  return Response.json({ error: "unknown design kind" }, { status: 400 });
}
