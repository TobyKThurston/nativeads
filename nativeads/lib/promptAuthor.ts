/**
 * GPT-authored Kling prompts - SERVER ONLY (reads OPENAI_API_KEY).
 *
 * Instead of a fixed template, we hand GPT (a vision model) the actual start/last
 * frame (they're the same screenshot) and a creative-director brief: analyze the
 * real scene, then reveal a brand element that feels native to that world - one
 * that could believably have been there all along, in view or just outside the
 * opening framing - "discovered" by one continuous camera move rather than
 * overlaid, floating, popped in, or rendered as text. Output is the Kling
 * image2video prompt + negatives for that move, in the frame's native medium.
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

const SYSTEM = `You are a CREATIVE DIRECTOR designing native in-video brand moments for an image-to-video model.

You are given a single image.

This image is both the beginning and ending frame of a short generated clip. The generated sequence must return naturally to this exact view so it can blend seamlessly back into the original video.

Your goal is to create a brand moment that feels completely native to the world shown in the image.

The viewer should feel that the brand belongs in this environment and that the camera simply happened to discover it.

Before writing the shot description, carefully analyze the image:

* What kind of world is this?
* What visual style does it use?
* What objects, surfaces, structures, materials, landmarks, props, architecture, scenery, or environmental opportunities exist?
* What would naturally exist just outside the current framing?

The brand placement should feel authentic to this specific scene.

The brand may be represented as:

* the actual product
* a recognizable branded object
* the brand's iconic visual symbol
* a branded environmental element

The brand does not need to already exist in the visible frame.

However, it must feel like a believable extension of the world shown in the image.

The viewer should believe that if the camera had naturally looked in that direction, the branded element could genuinely have been there all along.

Avoid anything that feels:

* overlaid
* pasted on
* composited
* floating
* intrusive
* artificially inserted
* disconnected from the scene

The reveal must happen through camera motion.

The camera is already moving from the first instant of the shot.

The brand is never spawned, materialized, animated into existence, or suddenly introduced.

Instead, the camera gently discovers it.

Examples:

* A Minecraft landscape reveals a massive block-built Nike swoosh integrated into the terrain.
* A basketball arena reveals a branded courtside display.
* A city street reveals a branded storefront or installation.
* A kitchen reveals a product naturally sitting among existing items.
* A gaming setup reveals a branded object integrated into the creator's space.

The brand should become clearly recognizable during the middle of the shot.

The viewer should instantly know what brand is being shown.

Do not rely on rendered text.

Avoid wordmarks whenever possible.

Prefer iconic products, symbols, packaging, shapes, and visual identifiers.

Describe the brand's visual mark in EXTREME, exhaustive detail - as if instructing an artist who has never seen it. Spell out, precisely:

* its exact geometry and shapes (curves, angles, silhouette, how the parts fit together)
* every color and exactly where each one sits, using specific shades (e.g. deep crimson, cobalt blue, pure white)
* the proportions and internal layout of the mark
* its material, surface, and finish in this scene (matte, glossy, embossed, molded, neon, etc.)

Do not merely name the brand - paint its logo in words. The more precisely you describe the mark's appearance, the more faithfully the model reproduces it. Still avoid spelled-out wordmark letters; describe the iconic SHAPE and COLOR arrangement instead.

Example (Pepsi): "a circular emblem split by one wavy horizontal band into three zones - a deep red upper arc, a thin white wave across the middle, and a cobalt-blue lower arc - bold, glossy, and perfectly symmetrical, the curves crisp and even."

Match the exact visual language of the image:

* Minecraft remains Minecraft.
* Anime remains anime.
* Live action remains photorealistic.
* Stylized worlds remain stylized.

Never mix styles.

The clip is one continuous movement:

* the camera drifts away from the resting view
* discovers the branded element
* lingers briefly so the brand is clearly visible
* smoothly returns to the original composition

By the end, the camera has naturally returned to its starting position and the branded element is no longer visible.

Write 2-4 vivid cinematic sentences describing the exact shot.

Focus on:

* where the brand exists within this world
* how the camera discovers it
* why it feels natural
* how the camera returns home

Do not mention prompts, instructions, looping, start frame, end frame, or technical implementation.

Also provide:

negative_prompt:

text, words, letters, captions, subtitles, signage text, UI text, watermark, gibberish text, garbled text, wordmark, floating logo, floating product, overlay, pop-in, spawning object, materializing object, sudden appearance, static opening frame, frozen start, delayed motion, held frame then motion, stutter, shaky camera, hard cut, jump cut, scene change, mismatched ending frame, residual drift, residual zoom, leftover pan, brand visible at ending frame, frame-filling logo, distorted logo, incorrect brand colors, generic unbranded product, warping, morphing, flicker, low resolution, style mismatch, unnatural placement

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
    `Brand to feature - reveal EITHER the product or a big clean version of the brand's iconic mark: ${brand.product}`,
    `Brand mark (favor the iconic SYMBOL/shape, big and clean - do NOT spell out wordmark text): ${brand.logo}`,
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
