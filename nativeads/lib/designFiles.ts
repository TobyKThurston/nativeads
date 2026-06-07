/**
 * Design-file prompt builders — isomorphic and pure (no network, no node/browser
 * APIs). These produce the Nano Banana prompts for the two design files (§2/§6):
 *   - brand file: the product as a clean isolated asset, in the scene's medium
 *   - style file: the world's look only, no product/brand (non-native videos)
 *
 * Kept separate from lib/providers/nanobanana.ts so they're unit-testable
 * without a key or a network round trip (Subtask 7).
 */

import type { Brand } from "./types";
import { styleById, type StyleId } from "./style";

export type BrandFilePromptArgs = {
  brand: Brand;
  styleId: StyleId;
  /** whether the real product PNG (Brand.productImage) is attached as image 2 */
  hasProductImage: boolean;
  /** optional moment context from the transcript layer (§3) */
  transcript?: string;
};

/** Nano Banana prompt for the per-brand clean product reference image (§6a). */
export function buildBrandFilePrompt(args: BrandFilePromptArgs): string {
  const { brand } = args;
  const style = styleById(args.styleId);
  const transcript = args.transcript?.trim();
  return [
    `Produce a CLEAN PRODUCT REFERENCE IMAGE of ${brand.product}.`,
    `Use the first attached image ONLY as a reference for visual medium, art style, lighting, texture and rendering — NOT for composition or background. Render the product in that exact medium: ${style.productClause}.`,
    args.hasProductImage
      ? `The second attached image is the real product and logo. Match its logo, wordmark, shape and colors EXACTLY — correct spelling, correct proportions.`
      : null,
    `Show ${brand.logo}, in ${brand.name}'s signature colors (accent ${brand.color}), clearly legible and correctly spelled. Center the product, isolated on a plain neutral background. No scene, no people, no captions or overlay text, no extra objects, no watermark. Realistic proportions — a single product, not a collage.`,
    transcript ? `Context from the moment: "${transcript}".` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export type StyleFilePromptArgs = { styleId: StyleId };

/** Nano Banana prompt for the per-video style reference plate (§6b). */
export function buildStyleFilePrompt(args: StyleFilePromptArgs): string {
  const style = styleById(args.styleId);
  return [
    `From the attached frame, produce a STYLE REFERENCE PLATE that captures this video's visual world: its medium, color palette, lighting, texture and mood.`,
    `Same medium and look as the frame (${style.sceneDescriptor}). Include NO product, NO brand, NO added objects, and NO text. A clean, representative composition of the world's look only.`,
  ].join(" ");
}
