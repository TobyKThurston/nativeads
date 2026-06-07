import { describe, it, expect } from "vitest";
import { buildBrandFilePrompt, buildStyleFilePrompt } from "./designFiles";
import type { Brand } from "./types";

const brand: Brand = {
  id: "cocacola",
  name: "Coca-Cola",
  category: "Beverage",
  tagline: "Taste the feeling",
  color: "#F40009",
  product: "an ice-cold glass bottle of Coca-Cola",
  logo: "the white Coca-Cola script wordmark",
  productImage: "/products/cocacola.png",
};

describe("buildBrandFilePrompt", () => {
  it("includes the product, logo, brand color and medium clause", () => {
    const p = buildBrandFilePrompt({ brand, styleId: "voxel", hasProductImage: true });
    expect(p).toContain(brand.product);
    expect(p).toContain(brand.logo);
    expect(p).toContain(brand.color);
    expect(p).toContain("voxel"); // voxel productClause mentions voxel blocks
  });

  it("adds the real-product-image instruction only when one is attached", () => {
    const withImg = buildBrandFilePrompt({ brand, styleId: "native", hasProductImage: true });
    expect(withImg).toContain("second attached image");
    const without = buildBrandFilePrompt({ brand, styleId: "native", hasProductImage: false });
    expect(without).not.toContain("second attached image");
  });

  it("includes transcript context only when provided", () => {
    const withT = buildBrandFilePrompt({
      brand,
      styleId: "native",
      hasProductImage: false,
      transcript: "I'm parched",
    });
    expect(withT).toContain("I'm parched");
    const without = buildBrandFilePrompt({ brand, styleId: "native", hasProductImage: false });
    expect(without).not.toContain("Context from the moment");
  });

  it("keeps the brand file scene-free (neutral background, no scene)", () => {
    const p = buildBrandFilePrompt({ brand, styleId: "native", hasProductImage: false });
    expect(p).toContain("neutral background");
    expect(p).toMatch(/No scene/i);
  });
});

describe("buildStyleFilePrompt", () => {
  it("captures the medium and forbids product/brand/text", () => {
    const p = buildStyleFilePrompt({ styleId: "anime" });
    expect(p).toMatch(/STYLE REFERENCE PLATE/);
    expect(p).toContain("NO product");
    expect(p).toContain("NO brand");
    expect(p).toContain("NO text");
  });
});
