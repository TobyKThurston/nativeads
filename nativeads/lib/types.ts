export type VideoSource =
  | { kind: "file"; url: string; name: string }
  | { kind: "youtube"; id: string; url: string };

export type Frame = {
  /** data URL (file) or thumbnail URL (youtube) */
  url: string;
  /** intrinsic aspect ratio, width / height */
  aspect: number;
};

/** A simulated ad-placement surface, in normalized 0..1 frame coordinates. */
export type Surface = {
  id: string;
  label: string;
  /** detection confidence, 0..1 */
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** the hero surface where the brand ad gets composited in previews */
  primary?: boolean;
};

export type Brand = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  /** brand signal color */
  color: string;
  /** the signature hero product to render in the ad (e.g. "an Apple iPhone") */
  product: string;
  /** how the brand mark reads on the product, so Kling renders it recognizably */
  logo: string;
  /**
   * Real product image (transparent PNG under /public/products/<id>.png).
   * When set, we composite these *actual pixels* into the start frame instead
   * of asking Kling to invent the product — that's what keeps the logo legible
   * (a text-to-video model can't spell a wordmark). Optional: brands without an
   * asset fall back to text-only generation.
   */
  productImage?: string;
};

export type Step =
  | "landing"
  | "analyzing"
  | "detection"
  | "brands"
  | "branching"
  | "previews";
