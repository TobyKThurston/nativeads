/**
 * GPT-authored Kling prompts - SERVER ONLY (reads OPENAI_API_KEY).
 *
 * Instead of a fixed template, we hand GPT the actual start/last frame (they're
 * the same screenshot) and a creative-director brief: invent the most memorable,
 * on-brand moment that could happen in THIS shot, then write the Kling
 * image2video prompt for it. Feeding the brand's category + tagline gives it the
 * vibe to riff on, so it builds a little world around the product (a character
 * using it, the brand's color washing the scene) instead of just parking the
 * product on a surface - all rendered native to the frame's visual medium.
 *
 * Same OpenAI Responses API + json_schema pattern as app/api/analyze. Returns
 * null on any failure so the caller falls back to the buildPrompt template.
 */

import type { Brand } from "./types";
import { styleById, type StyleId } from "./style";
import { surfacePhrase, type GenSurface } from "./generation";

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM = `You are a CREATIVE DIRECTOR writing prompts for Kling, an image-to-video model. You
design NATIVE in-video brand moments - the kind of placement that feels like a beat the creator shot
on purpose, not an ad bolted on.

You are given ONE video frame. It is used as BOTH the first and last frame of a short clip
(image == image_tail), so the clip MUST begin and end on this exact frame, unchanged, and loop
seamlessly back into the original video. The brand moment therefore lives entirely in the MIDDLE of
the clip: the very first and very last frame are the untouched original scene, with no brand element
yet visible.

YOUR JOB - put the PRODUCT on screen, unmissably. The entire point of this clip is the ad. The actual
named product (see "Hero product to feature" below) MUST be clearly, recognizably RENDERED and be the
visible SUBJECT of the shot - the thing the eye goes straight to. If a viewer paused mid-clip and
couldn't instantly name the brand from the product on screen, the clip has FAILED. Nothing else
matters as much as this.

Your creativity goes into HOW the real product shows up and gets used - NEVER into whether it appears:
- Reveal it naturally for THIS scene and let it be USED, not just sat there: a character reaches for
  it and uses it, it powers or reacts to the action already happening in the shot, someone enjoys it.
- Make it read like a real commercial: at the hero beat the product turns so its LOGO faces camera and
  is unmistakable, and where the scene allows, a character actually uses / drinks / wears / holds it -
  the kind of clean product moment you'd see in an actual ad.
- Give it a believable reason to be here that fits the brand's vibe - read the category + tagline for
  TONE (joyful and shared, kinetic and bold, clean and magical, live and electric) and make the
  product's moment feel unmistakably like THAT brand.
- Render the product, and anything around it, in the scene's EXACT visual medium and art style -
  Minecraft -> blocky voxels, anime -> cel-shaded, live-action -> photoreal. Never mix mediums.
- DO NOT substitute the product with abstract brand vibes - a color wash over the scene, a logo
  glowing in the air, ambient particles, the scene merely "feeling" like the brand. That is NOT an
  ad. The physical product itself must be in frame, rendered, and recognizable.
Be specific to THIS frame, but the product is always literally there - it is the subject, not a hint.

NON-NEGOTIABLE guardrails (the idea is yours; these are fixed):
- CLOSED LOOP. The camera may move expressively - a push-in, gentle orbit, parallax or crane (scale
  the size of the move to the clip length, per the pacing rule below) -
  but whatever it does, it returns to the EXACT opening framing by the end (same position, angle,
  focal length), and whatever you introduced is gone again, so the final frame equals the first with
  zero net change. Think "there and back," not "A to B." This is what lets it move freely AND splice
  seamlessly back into the source footage.
- PRODUCT PRESENT & LEGIBLE. The named hero product is actually rendered and recognizable, with its
  logo reading clearly and correctly in the brand's colors, held steady (not motion-blurred) the whole
  time it's on screen. This IS the shot - it is non-negotiable, not a background detail.
- PROMINENT, FOCAL SCALE. The product is the focal subject - big and central enough to read at a
  glance and clearly be what the shot is about - while still sitting believably in the scene. Not a
  tiny prop lost in the background; not absurdly oversized or clipping out of frame.
- NATIVE, not an overlay. No captions, subtitles, UI, or watermark text. No hard cut or scene change;
  the surrounding world stays consistent and keeps behaving naturally.
- SHORT CLIP - MAXIMIZE BRAND TIME. The clip is very short (see Clip length below; often just 5s), so
  commit to ONE simple idea - no multi-step action a few seconds can't land. Get the product on screen
  FAST (within the first ~0.5-1s) and KEEP it there, clear and legible, for as much of the clip as
  possible; it should only clear in the final moment so the last frame is the clean plate again. The
  empty original scene is just the first and last instant - NOT half the clip spent moving in and out.
  On a 5s clip favor a simple move (a gentle push-in or slight drift) so the product can hold legible
  through the whole middle; save bigger sweeps or a full 360 for a 10s clip. Brand on-screen time is
  the goal - longer and legible beats shorter and flashy.

Write 2-4 vivid, concrete sentences that read like a strong shot description: state the creative
idea, the SPECIFIC camera move, and how the brand moment plays out and resolves home. Do not use
"first frame"/"last frame" jargon - express it as a move that begins and ends on the resting scene.

Also write negative_prompt: a comma-separated list guarding against a camera move that fails to
return (ending on a different framing, mismatched first and last frame, residual zoom, leftover
camera drift), jarring or shaky handheld motion, hard cut, jump cut, scene change, the product
lingering or still present at the end, oversized or frame-filling product, motion-blurred or
illegible logo, garbled/misspelled/wrong/distorted logo, wrong brand colors, generic unbranded
product, captions/subtitles/overlays/watermark, warping, morphing, flicker, lowres.

Return JSON: { "prompt": string, "negative_prompt": string }.`;

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
  image: string; // data URL or http URL - the same frame used as image & image_tail
  brand: Brand;
  styleId: StyleId;
  surface: GenSurface;
  scene?: string;
  durationSec: number;
};

/** Ask GPT to write the Kling prompt for this frame + brand. Null → caller uses the template. */
export async function authorKlingPrompt(
  args: AuthorArgs
): Promise<{ prompt: string; negative_prompt: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  // gpt-5.5 is the best vision + structured-output model - it reads the frame's
  // medium far more reliably than 4o-mini, which is what makes the placement land.
  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const style = styleById(args.styleId);
  const { brand } = args;

  // Structured facts for GPT. Brand vibe (category + tagline) is creative fuel for the
  // concept; the medium is read primarily from the image, with the style as a hint.
  const facts = [
    `Brand: ${brand.name} (${brand.category})`,
    `Brand vibe / tagline (sets the tone of your idea): "${brand.tagline}"`,
    `Hero product to feature: ${brand.product}`,
    `Logo / brand mark (must read clearly): ${brand.logo}`,
    `Brand colors: ${brand.name}'s signature colors (accent ${brand.color})`,
    `Placement hint (a natural spot, but use your judgment - the moment can happen anywhere believable): ${surfacePhrase(args.surface)}`,
    args.scene ? `Scene (detected): ${args.scene}` : null,
    `Visual medium hint (operator-selected, defer to the image if it disagrees): ${style.label} - ${style.sceneDescriptor}; product rendered ${style.productClause}`,
    `Clip length: ${args.durationSec}s`,
  ]
    .filter(Boolean)
    .join("\n");

  // gpt-5.x are reasoning models. This call is awaited inline by POST /api/generate,
  // so keep it snappy with low effort - interpreting one frame + writing a few
  // sentences doesn't need deep deliberation. Guarded so an env override to a
  // non-reasoning model (e.g. gpt-4o) doesn't send an unsupported param.
  const body: Record<string, unknown> = {
    model,
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `You're directing a native brand moment in this scene. Invent the idea first, then write the Kling prompt for it. This frame is BOTH the first and last frame, so the shot must begin and end on it exactly.\n\n${facts}`,
          },
          { type: "input_image", image_url: args.image },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "kling_prompt", schema: SCHEMA, strict: true } },
  };
  if (/^gpt-5/.test(model)) body.reasoning = { effort: "low" };

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
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
