import { describe, it, expect } from "vitest";
import { buildVeoRequest, type GenerationSpec } from "./generation";
import type { Brand } from "./types";

const brand: Brand = {
  id: "nike",
  name: "Nike",
  category: "Footwear",
  tagline: "Just do it",
  color: "#F5F5F5",
  product: "a pair of Nike sneakers",
  logo: "the white Nike swoosh",
};

const baseSpec: GenerationSpec = {
  brand,
  surface: { id: "table", label: "TABLETOP", x: 0.3, y: 0.5, w: 0.3, h: 0.2 },
  styleId: "native",
  frame: "data:image/jpeg;base64,QUJD", // "ABC"
  timestamp: 12,
  durationSec: 5,
};

describe("buildVeoRequest", () => {
  it("uses the same clean frame for first and last (seamless splice)", () => {
    const req = buildVeoRequest(baseSpec);
    expect(req.image).toBe(req.last_image);
    expect(req.image).toBe(baseSpec.frame); // full frame kept so the adapter has the mime
  });

  it("maps reference images to a bare url list", () => {
    const req = buildVeoRequest({
      ...baseSpec,
      referenceImages: [
        { kind: "brand", url: "https://x/b.png" },
        { kind: "style", url: "https://x/s.png" },
      ],
    });
    expect(req.reference_images).toEqual(["https://x/b.png", "https://x/s.png"]);
  });

  it("has no reference images when the spec has none", () => {
    expect(buildVeoRequest(baseSpec).reference_images).toEqual([]);
  });

  it("prefers an authored prompt over the template", () => {
    const req = buildVeoRequest(baseSpec, { prompt: "AUTHORED", negative_prompt: "NEG" });
    expect(req.prompt).toBe("AUTHORED");
    expect(req.negative_prompt).toBe("NEG");
  });

  it("falls back to the template when the authored pair is incomplete", () => {
    const req = buildVeoRequest(baseSpec, { prompt: "AUTHORED" }); // missing negative_prompt
    expect(req.prompt).not.toBe("AUTHORED");
    expect(req.prompt).toContain("Nike");
  });
});
