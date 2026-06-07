import { describe, it, expect } from "vitest";
import { frameHash, brandFileKey, styleFileKey } from "./store";

const frame = (fill: string, n = 5000) => `data:image/jpeg;base64,${fill.repeat(n)}`;

describe("frameHash", () => {
  it("is deterministic for the same input", () => {
    const f = frame("A");
    expect(frameHash(f)).toBe(frameHash(f));
  });

  it("differs for different frame content", () => {
    expect(frameHash(frame("A"))).not.toBe(frameHash(frame("B")));
  });

  it("returns a compact base36 string, not the raw frame", () => {
    const h = frameHash(frame("A"));
    expect(h).toMatch(/^[0-9a-z]+$/);
    expect(h.length).toBeLessThan(16);
  });
});

describe("cache keys", () => {
  const f = "data:image/jpeg;base64,AAAA";

  it("brandFileKey encodes brand, style and frame hash", () => {
    expect(brandFileKey("cocacola", "voxel", f)).toBe(`bf:cocacola:voxel:${frameHash(f)}`);
  });

  it("styleFileKey is independent of brand", () => {
    expect(styleFileKey("voxel", f)).toBe(`sf:voxel:${frameHash(f)}`);
  });

  it("distinguishes brands and styles on the same frame", () => {
    expect(brandFileKey("pepsi", "voxel", f)).not.toBe(brandFileKey("cocacola", "voxel", f));
    expect(brandFileKey("cocacola", "anime", f)).not.toBe(brandFileKey("cocacola", "voxel", f));
  });
});
