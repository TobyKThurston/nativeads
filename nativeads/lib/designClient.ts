"use client";

/**
 * Client-side design-file resolver (§3/§6): cache → /api/design → cache.
 *
 * Nano Banana runs server-only, but the cache (store.ts IndexedDB) is
 * client-side, so the client owns resolution: it looks up the cache first, asks
 * the server to generate on a miss, then caches the result. This is what makes
 * the per-video style file generated ONCE and shared across the three brand
 * cuts, and makes regenerating a brand free. Always null-safe → text-only.
 */

import { brandFileKey, styleFileKey, getDesignFile, putDesignFile } from "./store";
import type { Brand } from "./types";
import type { StyleId } from "./style";
import type { ReferenceImage } from "./generation";

async function postDesign(body: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch("/api/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { url?: string | null };
    return d.url ?? null;
  } catch {
    return null;
  }
}

/** Resolve (cache-or-generate) the per-brand product reference. Null → text-only. */
export async function resolveBrandFile(args: {
  frame: string;
  brand: Brand;
  styleId: StyleId;
  transcript?: string;
}): Promise<ReferenceImage | null> {
  const key = brandFileKey(args.brand.id, args.styleId, args.frame);
  const cached = await getDesignFile(key);
  if (cached) return { kind: "brand", url: cached };
  const url = await postDesign({
    kind: "brand",
    frame: args.frame,
    brandId: args.brand.id,
    styleId: args.styleId,
    transcript: args.transcript,
  });
  if (!url) return null;
  await putDesignFile(key, url);
  return { kind: "brand", url };
}

/**
 * Resolve (cache-or-generate) the per-video style plate. Returns null for
 * `native` footage (the clean frame is the style) or when generation is off. §2
 */
export async function resolveStyleFile(args: {
  frame: string;
  styleId: StyleId;
}): Promise<ReferenceImage | null> {
  if (args.styleId === "native") return null;
  const key = styleFileKey(args.styleId, args.frame);
  const cached = await getDesignFile(key);
  if (cached) return { kind: "style", url: cached };
  const url = await postDesign({ kind: "style", frame: args.frame, styleId: args.styleId });
  if (!url) return null;
  await putDesignFile(key, url);
  return { kind: "style", url };
}
