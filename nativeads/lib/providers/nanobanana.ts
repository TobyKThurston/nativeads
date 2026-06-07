/**
 * Nano Banana (Gemini image) design-file generator — SERVER ONLY
 * (reads GEMINI_API_KEY, uses node:fs to load /public product assets).
 *
 * Generates the two design files (§2/§6): a per-brand clean product reference
 * (finally consuming Brand.productImage) and a per-video style plate. Each
 * returns a data URL on success or `null` on no-key/error — mirroring
 * authorKlingPrompt's contract, so the pipeline degrades to text-only generation
 * exactly as it does today.
 *
 * Endpoint: Gemini `…/v1beta/models/<IMAGE_MODEL>:generateContent` with API-key
 * auth. Model id is a preview string in lib/config.ts — env-overridable.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Brand } from "../types";
import type { StyleId } from "../style";
import { IMAGE_MODEL, GEMINI_BASE_URL } from "../config";
import { buildBrandFilePrompt, buildStyleFilePrompt } from "../designFiles";

export function isImageConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

type InlinePart = { inline_data: { mime_type: string; data: string } };

/** Turn a data URL or http(s) URL into a Gemini inline image part. Null on failure. */
async function inlineFromUrl(url: string): Promise<InlinePart | null> {
  try {
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      if (comma === -1) return null;
      const mime = url.slice(5, comma).split(";")[0] || "image/png";
      const data = url.slice(comma + 1);
      return data ? { inline_data: { mime_type: mime, data } } : null;
    }
    if (url.startsWith("http")) {
      const r = await fetch(url);
      if (!r.ok) return null;
      const mime = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length ? { inline_data: { mime_type: mime, data: buf.toString("base64") } } : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read a /public asset (e.g. Brand.productImage) into an inline part. Null on failure. */
async function inlineFromPublic(publicPath: string): Promise<InlinePart | null> {
  try {
    const rel = publicPath.replace(/^\/+/, "");
    const abs = path.join(process.cwd(), "public", rel);
    const buf = await readFile(abs);
    const mime = rel.endsWith(".png")
      ? "image/png"
      : rel.endsWith(".jpg") || rel.endsWith(".jpeg")
        ? "image/jpeg"
        : "application/octet-stream";
    return buf.length ? { inline_data: { mime_type: mime, data: buf.toString("base64") } } : null;
  } catch {
    return null;
  }
}

/** Extract the first inline image from a Gemini generateContent response as a data URL. */
function extractImage(data: unknown): string | null {
  const parts = (
    data as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }
  )?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const inline = (p.inline_data ?? p.inlineData) as
      | { mime_type?: string; mimeType?: string; data?: string }
      | undefined;
    if (inline?.data) {
      const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
      return `data:${mime};base64,${inline.data}`;
    }
  }
  return null;
}

/** One generateContent image call. Null on no-key/error. */
async function callImageModel(prompt: string, images: InlinePart[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${GEMINI_BASE_URL}/v1beta/models/${IMAGE_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, ...images] }] }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return extractImage(await r.json());
  } catch {
    return null;
  }
}

/**
 * Per-brand product reference. Sends the source frame (medium/style reference)
 * and, when present, the real product PNG (Brand.productImage) so the logo is
 * matched exactly. Returns a data URL or null.
 */
export async function generateBrandFile(args: {
  frame: string;
  brand: Brand;
  styleId: StyleId;
  scene?: string;
  transcript?: string;
}): Promise<string | null> {
  if (!isImageConfigured()) return null;
  const frameImg = await inlineFromUrl(args.frame);
  if (!frameImg) return null; // the medium reference is required
  const productImg = args.brand.productImage
    ? await inlineFromPublic(args.brand.productImage)
    : null;
  const prompt = buildBrandFilePrompt({
    brand: args.brand,
    styleId: args.styleId,
    hasProductImage: Boolean(productImg),
    transcript: args.transcript,
  });
  // Order matters: frame is "the first attached image", product is "the second".
  return callImageModel(prompt, productImg ? [frameImg, productImg] : [frameImg]);
}

/**
 * Per-video style plate (medium/palette/lighting, no product). Returns a data
 * URL or null. Callers should gate this on styleId !== "native" (§2).
 */
export async function generateStyleFile(args: {
  frame: string;
  styleId: StyleId;
}): Promise<string | null> {
  if (!isImageConfigured()) return null;
  const frameImg = await inlineFromUrl(args.frame);
  if (!frameImg) return null;
  return callImageModel(buildStyleFilePrompt({ styleId: args.styleId }), [frameImg]);
}
