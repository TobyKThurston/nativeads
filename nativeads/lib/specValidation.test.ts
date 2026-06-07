import { describe, it, expect } from "vitest";
import { isValidSpec } from "./specValidation";

const valid = {
  brand: { id: "nike" },
  surface: { id: "table" },
  styleId: "native",
  frame: "data:image/jpeg;base64,AAAA",
  timestamp: 1,
  durationSec: 5,
};

describe("isValidSpec", () => {
  it("accepts a minimal valid spec", () => {
    expect(isValidSpec(valid)).toBe(true);
  });

  it("accepts the new optional fields (referenceImages, transcriptContext)", () => {
    expect(
      isValidSpec({
        ...valid,
        referenceImages: [{ kind: "brand", url: "x" }],
        transcriptContext: "hi",
      })
    ).toBe(true);
  });

  it("accepts an http frame and durationSec 10", () => {
    expect(isValidSpec({ ...valid, frame: "https://x/f.png", durationSec: 10 })).toBe(true);
  });

  it("rejects wrong-shaped optional fields", () => {
    expect(isValidSpec({ ...valid, referenceImages: "nope" })).toBe(false);
    expect(isValidSpec({ ...valid, transcriptContext: 5 })).toBe(false);
  });

  it("rejects a bad frame", () => {
    expect(isValidSpec({ ...valid, frame: "ftp://x" })).toBe(false);
    expect(isValidSpec({ ...valid, frame: 123 })).toBe(false);
  });

  it("rejects an unsupported duration", () => {
    expect(isValidSpec({ ...valid, durationSec: 7 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidSpec(null)).toBe(false);
    expect(isValidSpec("x")).toBe(false);
  });
});
