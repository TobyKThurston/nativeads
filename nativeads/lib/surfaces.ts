/**
 * Candidate ad-placement regions, in normalized 0..1 frame coordinates.
 * The timeline analyzer (lib/analyze.ts) measures real pixel statistics inside
 * each of these boxes at every sampled frame to score placement opportunities.
 */
export type Candidate = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const CANDIDATES: Candidate[] = [
  { id: "table", label: "TABLETOP", x: 0.34, y: 0.58, w: 0.34, h: 0.26 },
  { id: "wall", label: "WALL SURFACE", x: 0.05, y: 0.12, w: 0.26, h: 0.4 },
  { id: "signage", label: "BG SIGNAGE", x: 0.7, y: 0.1, w: 0.25, h: 0.32 },
  { id: "banner", label: "LOWER BANNER", x: 0.17, y: 0.79, w: 0.66, h: 0.15 },
  { id: "apparel", label: "APPAREL", x: 0.43, y: 0.34, w: 0.17, h: 0.3 },
];
