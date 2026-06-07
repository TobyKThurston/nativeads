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

const SYSTEM = `You write prompts for an image-to-video model that does NATIVE product placement —
the kind where the product is WOVEN into the scene through a real, motivated action, the way a
sponsored podcaster naturally grabs and sips a can of the drink mid-sentence. The opposite of
this — and the failure you must avoid at all costs — is a product that simply fades, pops, or
floats onto a spot in the frame like a sticker pasted on top. That looks like an ad bolted onto
the video. You are writing the OPPOSITE of that.

You are given ONE video frame. It is used as BOTH the first and last frame of a short clip, so the
clip opens and closes on this exact resting scene and loops seamlessly back into the source video.
Read this NOT as "the product is absent" but as: the whole product interaction happens BETWEEN
those two rest points and resolves back to rest — a subject reaches for the product, brings it in,
uses it, and lowers it back out of view so the scene returns to where it started.

How to write the prompt:

1. READ THE FRAME FIRST. Identify the SUBJECT and what they are doing: is there a person, a host,
   visible hands, a creator at a desk, a player/avatar, a character? What is the visual medium
   (live-action / Minecraft voxel / anime cel-shade / 3D / etc.)? Note a believable source for the
   product (just off-frame, on the desk edge, in a hand already in shot).

2. BUILD A MOTIVATED ACTION, not a reveal of a static object:
   - If there IS a person / host / hands in the frame: THEY introduce the product. They reach off
     to the side and bring the product into frame, pick it up, hold/sip/use it naturally, then set
     it back down or lower it out of view so the hands return to rest. The product is HANDLED and
     in motion — never sitting still waiting to be noticed.
   - If spoken context is provided, let it MOTIVATE the action and time it to the words — e.g.
     "I'm parched" → the host reaches over and takes a sip. This is the single strongest signal
     for making the placement feel native; use it whenever present.
   - Only if there is genuinely no actor in the scene: the product enters carried by the scene's
     own existing motion (a hand passing through, the camera following an action already underway),
     not by appearing on an empty surface.

3. NEVER write: the product fading in, popping in, materializing, being "revealed" on a table,
   hovering, glowing into existence, or appearing on an untouched surface while everything else
   holds still. If your sentence could describe a graphic pasted over the video, rewrite it as a
   physical action a subject performs.

4. Match the frame's visual medium and art style EXACTLY (voxel → blocky cubes, anime → cel-shaded,
   live-action → photoreal). The product reads as part of that world, same lighting and grain.

5. The brand must be recognizable and legible: render the named product, show its logo clearly in
   the brand's colors. Realistic scale — held/used at natural size, it must NOT fill or dominate
   the frame. No on-screen captions, subtitles, UI, or watermark text. No scene cut. The
   surrounding scene and camera framing stay continuous.

Write 2-4 vivid, concrete sentences naming the subject, the motivated action, the product, and how
the motion eases back to the resting scene. Do not use "first frame"/"last frame" jargon — express
it as action that begins and ends at rest.

Also write negative_prompt: a comma-separated list guarding against the pasted-on look (floating
product, product fading in, popping in, hovering, sticker/overlay/composite, product appearing on
its own) AND garbled/misspelled/wrong/distorted logo, wrong brand colors, generic unbranded
product, oversized or frame-filling product, captions/subtitles/overlays/watermark, warping,
morphing, flicker, scene change, abrupt cut, frozen scene, lowres.

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
  // Scene + spoken context lead — they are what make the placement *motivated* rather than pasted-on.
  const facts = [
    args.scene ? `Scene (detected in the frame): ${args.scene}. Anchor the action to a subject in THIS scene.` : null,
    transcript
      ? `Spoken context at this exact moment: "${transcript}". This is your strongest cue — make the action feel triggered by what is being said (e.g. a thirst remark → the host takes a sip), but never render captions or subtitles.`
      : null,
    `Brand: ${brand.name}`,
    `Product to feature (the thing a subject physically picks up / uses): ${brand.product}`,
    `Logo / brand mark: ${brand.logo}`,
    `Brand colors: ${brand.name}'s signature colors (accent ${brand.color})`,
    `Believable placement origin (where the product is brought in from / set back to): ${surfacePhrase(args.surface)}`,
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
      text: `Write the video prompt for this native ad. This frame is BOTH the first and last frame, so the action starts and ends at this resting scene. Weave the product in through a motivated action by a subject in the frame — do NOT have it fade or float onto a surface.\n\n${facts}`,
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
