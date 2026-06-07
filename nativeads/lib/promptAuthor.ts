/**
 * GPT-authored video prompts — SERVER ONLY (reads OPENAI_API_KEY).
 *
 * Instead of a fixed template, we hand GPT the actual start/last frame (they're
 * the same screenshot) and have it WRITE the image2video prompt, tailored to
 * what's really in the shot and its visual medium. That's what makes the ad
 * native: in a Minecraft clip GPT will say "a Coca-Cola bottle built from voxel
 * blocks is revealed as the camera eases left," not a generic photoreal bottle.
 *
 * When a brand design file is available (§2), GPT also SEES it as a second image
 * and is told the inserted product must match it exactly (§6c). Optional
 * transcript context (§3) grounds the moment.
 *
 * Same OpenAI Responses API + json_schema pattern as app/api/analyze. Returns
 * null on any failure so the caller falls back to the buildPrompt template.
 */

import type { Brand } from "./types";
import { styleById, type StyleId } from "./style";
import { surfacePhrase, type GenSurface, type ReferenceImage } from "./generation";

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM = `You write prompts for Kling, an image-to-video model, for NATIVE product placement.

You are given ONE video frame. It is used as BOTH the first and last frame of a short clip
(image == image_tail), so the clip MUST begin and end on this exact frame, unchanged, and loop
seamlessly back into the original video. The brand product can therefore only appear in the
MIDDLE of the clip — it must be absent at the very first and very last frame.

Write a Kling prompt that inserts the given brand product into THIS scene so it looks like it
always belonged there. Rules:
- Look at the frame. Match its visual medium and art style EXACTLY. If it's a Minecraft world,
  the product is built from blocky voxel cubes; if anime, it's cel-shaded; if live-action, it's
  photoreal. Never mix mediums.
- Ground the action in what is actually visible. Pick a believable spot from the real frame and a
  small, natural motion that reveals the product and then returns the scene to rest — e.g. "the
  camera eases left to reveal, on the crafting table, a Coca-Cola bottle built from red voxel
  blocks," then it settles back so the final frame matches the first exactly.
- The brand must be recognizable and legible: render the named product and show its logo clearly,
  in the brand's colors. Keep it at realistic scale — it must NOT fill or dominate the frame.
- No on-screen captions, subtitles, UI, or watermark text. No scene cut or transition. The
  surrounding scene never changes.
- Write 2-4 vivid, concrete sentences describing the shot and its motion, the way a strong
  video-generation prompt reads. Do not mention "first frame"/"last frame" jargon in the prompt
  itself — express it as motion that begins and ends on the resting scene.

Also write negative_prompt: a comma-separated list guarding against garbled/misspelled/wrong/
distorted logo, wrong brand colors, generic unbranded product, oversized or frame-filling product,
captions/subtitles/overlays/watermark, warping, morphing, flicker, scene change, abrupt cut, lowres.

Return JSON: { "prompt": string, "negative_prompt": string }.`;

/** Appended to SYSTEM only when a brand design file is attached as image #2 (§6c). */
const BRAND_REF_SYSTEM = `
You are also given a BRAND REFERENCE IMAGE (the second image): a clean render of
the exact product to insert, with the correct logo and colors. The product that
appears in the middle of the clip MUST match that reference image — same product,
same logo, same materials, same medium. Do not redesign it. Keep it at realistic
scale; it must not fill or dominate the frame.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    prompt: { type: "string", description: "The Kling image2video prompt, 2-4 sentences." },
    negative_prompt: { type: "string", description: "Comma-separated negative prompt." },
  },
  required: ["prompt", "negative_prompt"],
};

export type AuthorArgs = {
  image: string; // data URL or http URL — the same frame used as image & image_tail
  brand: Brand;
  styleId: StyleId;
  surface: GenSurface;
  scene?: string;
  durationSec: number;
  /** design files (§2); the brand file, when present, is shown to GPT as image #2 */
  referenceImages?: ReferenceImage[];
  /** windowed dialogue/context near the moment (§3) */
  transcript?: string;
};

/** Ask GPT to write the video prompt for this frame + brand. Null → caller uses the template. */
export async function authorVideoPrompt(
  args: AuthorArgs
): Promise<{ prompt: string; negative_prompt: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const style = styleById(args.styleId);
  const { brand } = args;
  const brandRef = args.referenceImages?.find((r) => r.kind === "brand")?.url;
  const transcript = args.transcript?.trim();

  // Structured facts for GPT; the medium is primarily read from the image, with this as a hint.
  const facts = [
    `Brand: ${brand.name}`,
    `Product to feature: ${brand.product}`,
    `Logo / brand mark: ${brand.logo}`,
    `Brand colors: ${brand.name}'s signature colors (accent ${brand.color})`,
    `Suggested placement: ${surfacePhrase(args.surface)}`,
    args.scene ? `Scene (detected): ${args.scene}` : null,
    transcript ? `Spoken context near this moment: "${transcript}". Use it to make the placement feel motivated and native, but never add captions or subtitles.` : null,
    `Visual medium hint (operator-selected, defer to the image if it disagrees): ${style.label} — ${style.sceneDescriptor}; product rendered ${style.productClause}`,
    `Clip length: ${args.durationSec}s`,
  ]
    .filter(Boolean)
    .join("\n");

  // Image #1 is always the source frame; image #2 (when present) is the brand
  // design file GPT must match. SYSTEM gets the §6c instruction only when so.
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `Write the video prompt for this native ad. This frame is BOTH the first and last frame.\n\n${facts}`,
    },
    { type: "input_image", image_url: args.image },
  ];
  if (brandRef) content.push({ type: "input_image", image_url: brandRef });
  const system = brandRef ? `${SYSTEM}\n${BRAND_REF_SYSTEM}` : SYSTEM;

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        text: { format: { type: "json_schema", name: "video_prompt", schema: SCHEMA, strict: true } },
      }),
    });

    if (!r.ok) return null;
    const data = await r.json();
    const text: string | undefined =
      data.output_text ??
      data.output
        ?.flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
        .find((c: { type: string; text?: string }) => c.type === "output_text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as { prompt?: string; negative_prompt?: string };
    if (!parsed.prompt || !parsed.negative_prompt) return null;
    return { prompt: parsed.prompt, negative_prompt: parsed.negative_prompt };
  } catch {
    return null;
  }
}

/** @deprecated Back-compat alias for {@link authorVideoPrompt}. */
export const authorKlingPrompt = authorVideoPrompt;
