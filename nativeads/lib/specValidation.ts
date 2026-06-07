/**
 * Generation-spec boundary validation — isomorphic + pure, so it's unit-testable
 * without spinning up the route or any server-only provider. Used by
 * /api/generate to guard untrusted request bodies.
 */

import type { GenerationSpec } from "./generation";

export function isValidSpec(s: unknown): s is GenerationSpec {
  if (!s || typeof s !== "object") return false;
  const v = s as Record<string, unknown>;
  // Optional fields (Subtask 1): tolerate absence; reject only wrong shapes.
  if (v.referenceImages !== undefined && !Array.isArray(v.referenceImages)) return false;
  if (v.transcriptContext !== undefined && typeof v.transcriptContext !== "string") return false;
  return (
    typeof v.frame === "string" &&
    (v.frame.startsWith("data:") || v.frame.startsWith("http")) &&
    typeof v.styleId === "string" &&
    typeof v.brand === "object" &&
    typeof v.surface === "object" &&
    (v.durationSec === 5 || v.durationSec === 10)
  );
}
