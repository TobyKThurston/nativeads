import { describe, it, expect } from "vitest";
import { pickScanTimes, rankTopMoments, type AnalysisResult, type ScoredSurface } from "./analyze";

/** Minimal AnalysisResult for ranking tests — only timestamp + primary.score matter. */
function moment(timestamp: number, score: number): AnalysisResult {
  const primary = { id: "s", label: "L", x: 0, y: 0, w: 0.2, h: 0.2, score, metrics: { area: 0, flatness: 0, centrality: 0, duration: 0, nativeness: 0 } } as ScoredSurface;
  return {
    frame: { url: "data:", aspect: 16 / 9 },
    timestamp,
    duration: 100,
    confidence: score,
    primary,
    surfaces: [primary],
    source: "heuristic",
  };
}

describe("pickScanTimes", () => {
  it("returns `count` distinct times inside the clip, in spread order", () => {
    const times = pickScanTimes(100, 6);
    expect(times).toHaveLength(6);
    for (const t of times) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(100);
    }
    // segments are non-overlapping with bounded jitter → strictly increasing
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("falls back to spread second-guesses when duration is unknown (0)", () => {
    const times = pickScanTimes(0, 3);
    expect(times).toHaveLength(3);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("returns nothing for a non-positive count", () => {
    expect(pickScanTimes(100, 0)).toEqual([]);
  });
});

describe("rankTopMoments", () => {
  it("keeps the top n by score, then orders them along the timeline", () => {
    const moments = [moment(10, 0.2), moment(50, 0.9), moment(80, 0.7), moment(95, 0.5)];
    const top = rankTopMoments(moments, 3);
    expect(top.map((m) => m.timestamp)).toEqual([50, 80, 95]); // 0.2 dropped, sorted by time
  });

  it("skips moments within minGap when distinct alternatives exist", () => {
    // 40.5 is the 2nd-strongest but sits beside 40 — with 70/90 available to fill
    // the three slots, the clustered one is dropped in favor of distinct spots.
    const moments = [moment(40, 0.95), moment(40.5, 0.9), moment(70, 0.6), moment(90, 0.55)];
    const top = rankTopMoments(moments, 3, 1.5);
    expect(top.map((m) => m.timestamp)).toEqual([40, 70, 90]);
  });

  it("backfills past the gap rule rather than returning fewer than asked when possible", () => {
    const moments = [moment(40, 0.95), moment(40.5, 0.9), moment(41, 0.85)];
    const top = rankTopMoments(moments, 3, 1.5);
    expect(top).toHaveLength(3); // all three returned despite clustering
  });
});
