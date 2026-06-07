"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { VideoSource } from "@/lib/types";
import {
  captureFrame,
  heuristicFromImage,
  heuristicYouTube,
  pickScanTimes,
  rankTopMoments,
  fmtTime,
  type AnalysisResult,
  type Capture,
  type ScoredSurface,
} from "@/lib/analyze";
import { requestGptDetection, fetchYouTubeFrame } from "@/lib/detect";
import { youtubeThumb, youtubeThumbFallback, youtubeEmbed } from "@/lib/youtube";
import { Button, ArrowRight } from "./ui/Button";

const LIME = "#ff6a3d"; // coral — kept the name to minimise churn
const CYAN = "#2fa8e6"; // sky
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How many frames we scan cheaply, and how many moments we keep (one per cut). */
const SCAN_FRAMES = 6;
const MOMENTS = 3;

export function Analyzing({
  source,
  onComplete,
}: {
  source: VideoSource;
  /** the top moments (one per upcoming brand cut), best-scoring first by timeline */
  onComplete: (moments: AnalysisResult[]) => void;
}) {
  const isFile = source.kind === "file";
  const [phase, setPhase] = useState<"capturing" | "thinking" | "done">("capturing");
  const [frameImage, setFrameImage] = useState("");
  const [t, setT] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [moments, setMoments] = useState<AnalysisResult[]>([]);

  useEffect(() => {
    const signal = { cancelled: false };
    (async () => {
      const tStart = performance.now();
      // 1 — collect MOMENTS candidate frames (file: scan many cheaply + rank;
      //     youtube: pull a few real frames). Each carries its own timestamp.
      const { previewImage, previewT } = await firstGlimpse(source);
      if (signal.cancelled) return;
      setFrameImage(previewImage);
      setT(previewT);
      setPhase("thinking");

      const moments = await analyzeMoments(source, () => signal.cancelled);
      if (signal.cancelled || moments.length === 0) return;

      // small floor so the "thinking" beat reads as deliberate
      const elapsed = performance.now() - tStart;
      if (elapsed < 1500) await sleep(1500 - elapsed);
      if (signal.cancelled) return;

      setMoments(moments);
      setResult(moments[0]);
      setT(moments[0].timestamp);
      setFrameImage(moments[0].frame.url);
      setPhase("done");
    })();
    return () => { signal.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const doneTopId = result?.primary.id;
  const modelLabel = phase !== "done" ? "ANALYZING…" : result?.source === "gpt" ? `GPT · ${result.model ?? "openai"}` : "LOCAL HEURISTIC";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/15 px-3.5 py-1.5 text-[13px] font-bold text-coral">
            👀 Step 1 · Scanning
          </span>
          <h2 className="mt-3.5 font-display text-[clamp(24px,3.2vw,36px)] font-bold leading-tight tracking-tight text-chalk">
            {phase === "done"
              ? moments.length > 1 ? `Found ${moments.length} native moments!` : "Found the best spot!"
              : phase === "thinking" ? "Scanning for the best moments…" : "Grabbing frames…"}
          </h2>
        </div>
        <span className="hidden text-[13px] font-bold tabular text-fog sm:block">
          {phase === "done" ? "All done ✓" : `Frame @ ${fmtTime(t)}`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* ---- frame viewport ---- */}
        <div className="relative aspect-video w-full overflow-hidden rounded-3xl border-[3px] border-line-2 bg-ink-3" style={{ boxShadow: "0 8px 0 0 rgba(40,33,22,0.07)" }}>
          {phase !== "done" ? (
            source.kind === "file" ? (
              // fast-forward through the clip while we analyze
              <video
                key="loadvid"
                src={source.url}
                muted
                autoPlay
                loop
                playsInline
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  const d = v.duration || 10;
                  v.playbackRate = Math.min(16, Math.max(4, d / 2.2));
                  v.play().catch(() => {});
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <iframe
                key="loadyt"
                src={youtubeEmbed(source.id, { autoplay: true, mute: true, loop: true, controls: false })}
                title="scanning"
                allow="autoplay; encrypted-media; picture-in-picture"
                className="absolute inset-0 h-full w-full"
                style={{ border: 0 }}
              />
            )
          ) : frameImage ? (
            <img src={frameImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#11151c,#0b0e13)" }} />
          )}

          {phase !== "done" && (
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-line-2 bg-ink/70 px-2.5 py-1 backdrop-blur">
              <span className="text-[10px] leading-none text-lime">▶▶</span>
              <span className="mono text-[10px] tracking-wider text-chalk/90">FAST SCAN</span>
            </div>
          )}

          {/* detected surfaces on done */}
          {phase === "done" && result?.surfaces.map((s, i) => (
            <DoneBox key={s.id} s={s} index={i} top={s.id === doneTopId} />
          ))}

          {/* scan sweep while thinking */}
          {phase !== "done" && (
            <motion.div
              className="pointer-events-none absolute left-0 right-0 h-px bg-lime"
              style={{ boxShadow: "0 0 12px 1px rgba(200,255,61,0.8)" }}
              initial={{ top: "-5%" }}
              animate={{ top: ["-5%", "105%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-line-2 bg-ink/70 px-2.5 py-1 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" style={{ animation: phase !== "done" ? "ping 1.4s infinite" : "none" }} />
            <span className="mono text-[10px] tracking-wider text-chalk/90">{modelLabelShort(phase, result)}</span>
          </div>
          {phase === "done" && result && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-line-2 bg-ink/70 px-2.5 py-1 text-right backdrop-blur">
              <div className="mono text-[8px] tracking-wider text-fog">CONFIDENCE</div>
              <div className="font-display text-[18px] font-semibold leading-none tabular" style={{ color: LIME }}>{(result.confidence * 100).toFixed(1)}%</div>
            </div>
          )}

          <AnimatePresence>
            {phase === "done" && result && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-ink via-ink/70 to-transparent p-4 pt-12"
              >
                <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-lime">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="#08090c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <span className="font-display text-[18px] font-semibold tracking-tight">Best Placement Found</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="mono rounded bg-lime/15 px-2 py-0.5 text-[10px] tracking-wider text-lime">@ {fmtTime(result.timestamp)}</span>
                    <span className="mono rounded border border-line-2 px-2 py-0.5 text-[10px] tracking-wider text-fog">{result.primary.label}</span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          <style>{`@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`}</style>
        </div>

        {/* ---- console ---- */}
        <div className="flex flex-col gap-3">
          <div className="rounded-3xl border-2 bg-ink-2 p-4" style={{ borderColor: phase === "done" ? LIME : "var(--color-line-2)" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-wide text-fog">Vision model</span>
              <span className="text-[12px] font-bold" style={{ color: phase === "done" ? LIME : "#e8a13d" }}>
                ● {phase === "done" ? "locked" : "thinking"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border-2 border-line-2 bg-ink-3">
                {frameImage ? <img src={frameImage} alt="" className="h-full w-full object-cover" /> : <div className="shimmer absolute inset-0" />}
                {phase !== "done" && <div className="absolute inset-0 bg-[#FFC24B]/5" />}
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-[17px] font-semibold leading-none text-chalk">{modelLabel}</div>
                <div className="mt-1.5 text-[12px] font-semibold text-fog-2">
                  {phase === "done" ? `${result?.surfaces.length ?? 0} surfaces detected` : "vision reasoning…"}
                </div>
              </div>
            </div>
          </div>

          {/* logs / rationale */}
          <div className="flex-1 rounded-3xl border-2 border-line-2 bg-ink-2 p-4">
            {phase !== "done" ? (
              <ThinkingLog isFile={isFile} t={t} />
            ) : (
              <div>
                <span className="text-[12px] font-bold uppercase tracking-wide text-fog">Findings</span>
                {result?.rationale && (
                  <p className="mt-2 text-[14px] font-medium leading-relaxed text-chalk">“{result.rationale}”</p>
                )}
                <div className="mt-3 flex flex-col gap-1.5">
                  {result?.surfaces.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center gap-3">
                      <span className="w-28 truncate text-[12px]" style={{ color: s.primary ? LIME : "#c8c8da" }}>{s.label}</span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-3">
                        <div className="h-full rounded-full" style={{ width: `${s.score * 100}%`, background: s.primary ? LIME : "#5b626c" }} />
                      </div>
                      <span className="mono w-7 text-right text-[11px] tabular text-fog">{(s.score * 100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
                {result?.source === "heuristic" && (
                  <p className="mt-3 rounded-xl bg-sun/15 px-3 py-2 text-[12px] font-semibold leading-relaxed text-[#b8841f]">
                    No OPENAI_API_KEY — ran the local heuristic. Add it to .env.local or .env to use GPT vision.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <AnimatePresence>
          {phase === "done" && result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Button onClick={() => onComplete(moments.length ? moments : [result])}>
                Use {moments.length > 1 ? `these ${moments.length} moments` : "this placement"} <ArrowRight />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {phase !== "done" && (
          <span className="text-[14px] font-semibold text-fog-2">Grabbing a frame and finding native surfaces…</span>
        )}
      </div>
    </div>
  );
}

/** A quick frame to show while the vision pass runs (not necessarily a kept moment). */
async function firstGlimpse(source: VideoSource): Promise<{ previewImage: string; previewT: number }> {
  try {
    if (source.kind === "file") {
      const cap = await captureFrame(source.url);
      return { previewImage: cap.image, previewT: cap.t };
    }
    const real = await fetchYouTubeFrame(source.id);
    if (real) return { previewImage: real.image, previewT: real.t };
    const thumb = await resolveThumb(source.id);
    return { previewImage: thumb, previewT: Math.round(12 + Math.random() * 46) };
  } catch {
    return { previewImage: "", previewT: 0 };
  }
}

/**
 * Produce the top MOMENTS placements, one per upcoming brand cut. Files: scan
 * SCAN_FRAMES frames, rank them with the free local heuristic, then run the paid
 * GPT vision pass on only the best MOMENTS (so 3× analyze cost, not 6×). YouTube:
 * pull a few real frames and GPT each. Falls back to the heuristic whenever GPT
 * is unavailable. Returned ordered by timestamp so cut 1→3 follows the timeline.
 */
async function analyzeMoments(source: VideoSource, cancelled: () => boolean): Promise<AnalysisResult[]> {
  if (source.kind === "file") {
    // one capture learns the duration; the rest spread across the clip
    const first = await captureFrame(source.url).catch(() => null);
    if (!first || cancelled()) return [];
    const times = pickScanTimes(first.duration, SCAN_FRAMES - 1);
    const rest = await Promise.all(times.map((tt) => captureFrame(source.url, tt).catch(() => null)));
    if (cancelled()) return [];
    const caps = [first, ...(rest.filter(Boolean) as Capture[])];
    // cheap local score for every scanned frame → keep the best MOMENTS
    const scored = (await Promise.all(caps.map((c) => heuristicFromImage(c).catch(() => null)))).filter(
      Boolean
    ) as AnalysisResult[];
    const top = rankTopMoments(scored, MOMENTS);
    if (cancelled() || top.length === 0) return [];
    // upgrade the chosen few with GPT vision (own scene/surface/subject per moment)
    const finals = await Promise.all(
      top.map(async (h) => {
        const gpt = await requestGptDetection(h.frame.url, {
          timestamp: h.timestamp,
          duration: h.duration,
          aspect: h.frame.aspect,
        });
        return gpt ?? h;
      })
    );
    return finals.sort((a, b) => a.timestamp - b.timestamp);
  }

  // youtube: grab up to MOMENTS real frames (parallel), GPT each
  const reals = (
    await Promise.all(Array.from({ length: MOMENTS }, () => fetchYouTubeFrame(source.id)))
  ).filter(Boolean) as Capture[];
  if (cancelled()) return [];
  if (reals.length) {
    const finals = await Promise.all(
      reals.map(async (c) => {
        const gpt = await requestGptDetection(c.image, { timestamp: c.t, duration: c.duration, aspect: c.aspect });
        return gpt ?? heuristicYouTube(c.image, source.id, c.t);
      })
    );
    return dedupeByTime(finals).sort((a, b) => a.timestamp - b.timestamp);
  }
  // last resort: thumbnail + deterministic heuristic at spread timestamps
  const thumb = await resolveThumb(source.id);
  return pickScanTimes(0, MOMENTS).map((tt) => heuristicYouTube(thumb, source.id, Math.round(tt)));
}

/** Drop near-duplicate timestamps (within 1s) so cuts don't share a beat. */
function dedupeByTime(rs: AnalysisResult[]): AnalysisResult[] {
  const out: AnalysisResult[] = [];
  for (const r of rs) if (!out.some((o) => Math.abs(o.timestamp - r.timestamp) < 1)) out.push(r);
  return out.length ? out : rs;
}

function modelLabelShort(phase: string, result: AnalysisResult | null) {
  if (phase === "done") return "BEST PLACEMENT";
  return phase === "thinking" ? "AI VISION · ANALYZING" : "CAPTURING FRAME";
}

function ThinkingLog({ isFile, t }: { isFile: boolean; t: number }) {
  const lines = [
    `frame grabbed @ ${fmtTime(t)}`,
    isFile ? "downscaling to 1024px…" : "resolving thumbnail…",
    "POST /api/analyze",
    "vision model: locating native surfaces…",
    "scoring placement candidates…",
  ];
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-wide text-fog">Pipeline</span>
        <span className="text-[12px] font-bold text-coral">● live</span>
      </div>
      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <motion.div
            key={l}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.32 }}
            className="flex items-start gap-2"
          >
            <span className="mono text-[11px] text-lime-dim">›</span>
            <span className="mono text-[11px] leading-relaxed text-fog">
              {l}
              {i === lines.length - 1 && <span className="caret ml-0.5 text-lime">▍</span>}
            </span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function DoneBox({ s, index, top }: { s: ScoredSurface; index: number; top: boolean }) {
  const color = top ? LIME : CYAN;
  const showLabel = top || s.score > 0.5;
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: top ? 1 : 0.3 + s.score * 0.4, scale: 1 }}
      transition={{ delay: index * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 rounded-md" style={{ border: `1.5px solid ${color}`, boxShadow: top ? `0 0 26px -8px ${color}` : "none", background: top ? `${color}10` : "transparent" }} />
      {top &&
        ["-top-px -left-px border-t-2 border-l-2", "-top-px -right-px border-t-2 border-r-2", "-bottom-px -left-px border-b-2 border-l-2", "-bottom-px -right-px border-b-2 border-r-2"].map((p) => (
          <span key={p} className={`absolute h-3 w-3 ${p}`} style={{ borderColor: color }} />
        ))}
      {showLabel && (
        <span className="mono absolute -top-[18px] left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: color, color: "#06070a" }}>
          {s.label} · {(s.score * 100).toFixed(0)}
        </span>
      )}
    </motion.div>
  );
}

function resolveThumb(id: string): Promise<string> {
  return new Promise((resolve) => {
    const max = youtubeThumb(id);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 120 ? max : youtubeThumbFallback(id));
    img.onerror = () => resolve(youtubeThumbFallback(id));
    img.src = max;
  });
}
