"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Brand, VideoSource } from "@/lib/types";
import { fmtTime as fmt, type AnalysisResult } from "@/lib/analyze";
import { youtubeEmbed } from "@/lib/youtube";
import { useGeneration, type JobState } from "@/lib/useGeneration";
import { STYLES, inferStyle, type StyleId } from "@/lib/style";
import type { GenerationSpec, ReferenceImage } from "@/lib/generation";
import type { SavedClip } from "@/lib/store";
import { resolveBrandFile, resolveStyleFile } from "@/lib/designClient";

/** Generated clip length, in seconds — the window the native ad splices into. */
const AD_LEN = 5 as const;

/**
 * ⚠ COST GATE — which cuts actually generate, by 0-based index.
 *
 * Each generated cut is now a full pipeline: (0–1) style-file gen + 1 brand-file
 * gen (Nano Banana) + 1 video gen (Veo/Kling). With 3 brands that's up to
 * 1 + 3 + 3 paid calls PER video. Default is ALL THREE cuts so a demo never
 * silently ships one — set NEXT_PUBLIC_GENERATE_CUTS to throttle for cheap dev:
 *   unset/empty → all three   |   "0" → first cut only   |   "0,1,2" → all
 */
function parseGenerateCuts(raw: string | undefined): number[] | null {
  if (raw == null || raw.trim() === "") return null; // null = generate all
  const nums = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0);
  return nums.length ? nums : null;
}
const GENERATE_CUTS: number[] | null = parseGenerateCuts(process.env.NEXT_PUBLIC_GENERATE_CUTS);

export function Previews({
  source,
  analysis,
  brands,
  onRestart,
  mode = "create",
  initialStyleId,
  savedClips,
  onSave,
  restartLabel,
}: {
  source: VideoSource;
  analysis: AnalysisResult;
  brands: Brand[];
  onRestart: () => void;
  /** "create" = live flow with a Save action; "view" = replay a saved ad. */
  mode?: "create" | "view";
  /** style to start on (a saved ad's chosen style) */
  initialStyleId?: StyleId;
  /** brandId → clip URL, to seed the tiles when replaying a saved ad */
  savedClips?: Record<string, string | null>;
  /** when provided (create mode), shows a Save-to-gallery button */
  onSave?: (payload: { clips: SavedClip[]; styleId: StyleId }) => void;
  /** label for the secondary button (defaults to "Start over") */
  restartLabel?: string;
}) {
  const isFile = source.kind === "file";
  const startAt = analysis.timestamp;
  const surface = analysis.primary;

  // ---- native-ad generation (routed to Kling; mock until a key is wired) ----
  const hint = source.kind === "file" ? source.name : source.id;
  const [styleId, setStyleId] = useState<StyleId>(() => initialStyleId ?? inferStyle(hint).id);
  const { jobs, generate, reset: resetJobs } = useGeneration();
  const hasSaved = !!savedClips && Object.values(savedClips).some(Boolean);
  const started = Object.keys(jobs).length > 0 || hasSaved;

  // What each tile shows: a live (re)generation if one's running, otherwise the
  // saved clip seeded as an already-succeeded job. Live always wins.
  const displayJobs: Record<string, JobState> = {};
  for (const b of brands) {
    const live = jobs[b.id];
    if (live) {
      displayJobs[b.id] = live;
      continue;
    }
    const url = savedClips?.[b.id];
    if (url) {
      displayJobs[b.id] = {
        job: { id: `saved:${b.id}`, provider: "kling", status: "succeeded", progress: 1, videoUrl: url },
        error: null,
        pending: false,
      };
    }
  }

  // ---- which native ad is playing in the hero player ----
  const [selectedBrandId, setSelectedBrandId] = useState<string>(() => {
    const withClip = brands.find((b) => savedClips?.[b.id]);
    return (withClip ?? brands[0])?.id ?? "";
  });
  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? brands[0];
  const selectedJob = selectedBrand ? displayJobs[selectedBrand.id] : undefined;
  const selectedClip = selectedJob?.job?.videoUrl ?? null;
  /** the hero plays a seamless source→ad→source splice (file uploads only) */
  const heroSpliced = isFile && !!selectedClip;

  // ---- hero transport ----
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const heroMediaRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [heroMuted, setHeroMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);
  const [epoch, setEpoch] = useState(0); // youtube restart
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    const clips: SavedClip[] = brands.map((b) => {
      const live = jobs[b.id]?.job?.videoUrl ?? null;
      const url = live ?? savedClips?.[b.id] ?? null;
      return { brandId: b.id, videoUrl: url, provider: jobs[b.id]?.job?.provider };
    });
    onSave?.({ clips, styleId });
    setSaved(true);
  }, [brands, jobs, savedClips, styleId, onSave]);

  const runGeneration = useCallback(() => {
    setSaved(false); // a fresh render means there's something new to save
    void (async () => {
      // Resolve the per-video style file ONCE and share it across all three brand
      // cuts (§2). null for native footage or when image-gen is off.
      const styleRef = await resolveStyleFile({ frame: analysis.frame.url, styleId });
      await Promise.all(
        brands.map(async (b, i) => {
          if (GENERATE_CUTS && !GENERATE_CUTS.includes(i)) return; // cost gate: limit which cuts render
          // Per-brand product reference (cache-or-generate). null → text-only.
          const brandRef = await resolveBrandFile({
            frame: analysis.frame.url,
            brand: b,
            styleId,
            transcript: analysis.transcript,
          });
          const referenceImages = [brandRef, styleRef].filter(Boolean) as ReferenceImage[];
          const spec: GenerationSpec = {
            brand: b,
            surface: { id: surface.id, label: surface.label, x: surface.x, y: surface.y, w: surface.w, h: surface.h },
            styleId,
            // The captured moment is BOTH first and last frame — the splice points.
            // It stays the *real* source frame (never a composited product) so the
            // clip loops seamlessly back into the source. The product enters via
            // referenceImages (design files) + the authored prompt instead.
            frame: analysis.frame.url,
            timestamp: startAt,
            durationSec: AD_LEN,
            sceneContext: analysis.scene, // GPT's description of what's actually in the video
            transcriptContext: analysis.transcript, // §3 Whisper seam (no-op until populated)
            referenceImages: referenceImages.length ? referenceImages : undefined,
          };
          generate(b.id, spec);
        })
      );
    })();
  }, [brands, surface, styleId, analysis.frame.url, analysis.scene, analysis.transcript, startAt, generate]);

  // ---- transport handlers (act on the single hero player) ----
  function toggle() {
    if (heroSpliced) {
      // the splice self-loops; flip `playing` and SplicePreview pauses/resumes.
      setPlaying((p) => !p);
      return;
    }
    const v = heroVideoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().catch(() => {}); setPlaying(true); }
  }
  function seek(ratio: number) {
    const v = heroVideoRef.current;
    if (!v || !v.duration) return;
    const r = Math.min(1, Math.max(0, ratio));
    v.currentTime = r * v.duration;
    setProgress(r);
  }
  function toggleMute() {
    setHeroMuted((m) => {
      const next = !m;
      const v = heroVideoRef.current;
      if (v) v.muted = next;
      return next;
    });
  }
  function goFullscreen() {
    const el = heroVideoRef.current ?? heroMediaRef.current;
    if (!el) return;
    const fs =
      el.requestFullscreen?.bind(el) ??
      (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.bind(el) ??
      (el as unknown as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.bind(el);
    fs?.();
  }

  if (!selectedBrand) return null;

  const ytSrc = !isFile
    ? `${youtubeEmbed((source as { id: string }).id, { autoplay: true, mute: true, loop: true, controls: false, start: startAt })}&_=${epoch}`
    : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      {/* header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf/15 px-3.5 py-1.5 text-[13px] font-bold text-leaf">
            {mode === "view" ? "💾 Saved cut" : "✨ Step 5 · Render"}
          </span>
          <h2 className="mt-3.5 font-display text-[clamp(26px,3.4vw,40px)] font-bold leading-tight tracking-tight text-chalk">
            {mode === "view" ? "Your saved cut, replayed." : "One video, three native cuts."}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-coral/15 px-3 py-2 text-[12px] font-bold text-coral">
            📍 @ {fmt(startAt)}
          </span>
          <label className="flex items-center gap-1.5 rounded-full border-2 border-line-2 bg-ink-2 px-3 py-1.5 text-[12px] font-bold text-fog">
            <span className="hidden text-fog-2 sm:inline">Style</span>
            <select
              value={styleId}
              onChange={(e) => { setStyleId(e.target.value as StyleId); resetJobs(); setSaved(false); }}
              className="ring-focus cursor-pointer bg-transparent font-bold text-chalk outline-none"
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id} className="bg-ink-2 text-chalk">{s.label}</option>
              ))}
            </select>
          </label>
          <button
            onClick={runGeneration}
            className="btn-pop ring-focus inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2.5 text-[13.5px] font-bold text-white"
            style={{ ["--pop" as string]: "rgba(180,58,18,0.95)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-3 7h6l-3 7" /><path d="M5 12a7 7 0 0 0 7 7" opacity=".5" /></svg>
            {started ? "Regenerate" : "Generate"}
          </button>
          {onSave && (
            <button
              onClick={handleSave}
              disabled={saved}
              className="btn-pop ring-focus inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-[13.5px] font-bold"
              style={
                saved
                  ? { ["--pop" as string]: "rgba(40,33,22,0.12)", background: "rgba(63,191,106,0.14)", color: "#2f9c55", borderColor: "rgba(63,191,106,0.5)" }
                  : { ["--pop" as string]: "rgba(40,33,22,0.18)", background: "var(--color-ink-2)", color: "var(--color-chalk)", borderColor: "var(--color-line-2)" }
              }
            >
              {saved ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Saved!
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
                  Save
                </>
              )}
            </button>
          )}
          <button
            onClick={onRestart}
            className="btn-pop ring-focus rounded-full border-2 border-line-2 bg-ink-2 px-4 py-2 text-[13.5px] font-bold text-fog hover:text-chalk"
            style={{ ["--pop" as string]: "rgba(40,33,22,0.18)" }}
          >
            {restartLabel ?? "Start over"}
          </button>
        </div>
      </div>

      {/* hero player (left) + the three native ads (right) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── hero ── */}
        <div className="flex flex-col gap-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="group relative overflow-hidden rounded-3xl border-[3px] bg-ink-3"
            style={{ borderColor: selectedBrand.color, boxShadow: `0 8px 0 0 ${selectedBrand.color}` }}
          >
            <div ref={heroMediaRef} className="relative aspect-video w-full overflow-hidden bg-black">
              {heroSpliced ? (
                <SplicePreview srcUrl={(source as { url: string }).url} adUrl={selectedClip!} at={startAt} paused={!playing} muted={heroMuted} />
              ) : selectedClip ? (
                // non-file (e.g. YouTube) with a rendered ad: loop the clip on its own
                <video
                  src={selectedClip}
                  autoPlay
                  muted={heroMuted}
                  loop
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : isFile ? (
                <video
                  ref={heroVideoRef}
                  src={(source as { url: string }).url}
                  autoPlay
                  muted={heroMuted}
                  loop
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setDur(v.duration || 0);
                    try { v.currentTime = startAt; } catch {}
                    if (playing) v.play().catch(() => {});
                  }}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    setProgress(v.duration ? v.currentTime / v.duration : 0);
                  }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <iframe
                  src={ytSrc}
                  title={`${selectedBrand.name} cut`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  className="h-full w-full"
                  style={{ border: 0 }}
                />
              )}

              {/* spinning loading screen while Kling renders this cut */}
              {selectedJob?.pending && !selectedClip && (
                <KlingLoader state={selectedJob} color={selectedBrand.color} />
              )}

              {/* generation status for the cut on screen (hidden behind the loader) */}
              {selectedJob && !(selectedJob.pending && !selectedClip) && <GenStatusPill state={selectedJob} />}

              {/* which brand is on screen */}
              <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-2 rounded-full bg-ink-2/95 px-2.5 py-1 backdrop-blur">
                <span className="grid h-5 w-5 place-items-center rounded-md font-display text-[10px] font-bold text-white" style={{ background: selectedBrand.color }}>
                  {selectedBrand.name[0]}
                </span>
                <span className="text-[11px] font-bold text-chalk">{selectedBrand.name}</span>
              </div>

              {/* placeholder hint before generation runs (not while loading) */}
              {!selectedClip && !selectedJob?.pending && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center pb-2.5">
                  <span className="rounded-full bg-ink-2/95 px-2.5 py-1 text-[10px] font-bold text-fog-2 backdrop-blur">
                    Source · no ad yet
                  </span>
                </div>
              )}

              {/* fullscreen */}
              <button
                onClick={goFullscreen}
                title="Fullscreen"
                aria-label="Fullscreen"
                className="ring-focus absolute bottom-2 right-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-ink-2/95 text-fog opacity-0 backdrop-blur transition-opacity hover:text-chalk group-hover:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
            </div>
          </motion.div>

          {/* transport */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4 rounded-3xl border-2 border-line-2 bg-ink-2 px-4 py-3"
          >
            {isFile ? (
              <>
                <button onClick={toggle} className="ring-focus grid h-11 w-11 shrink-0 place-items-center rounded-full bg-coral text-white glow-lime">
                  {playing ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1.5" width="3.5" height="11" rx="1" /><rect x="8.5" y="1.5" width="3.5" height="11" rx="1" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.8v10.4a.8.8 0 0 0 1.23.67l8-5.2a.8.8 0 0 0 0-1.34l-8-5.2A.8.8 0 0 0 3 1.8Z" /></svg>
                  )}
                </button>

                {heroSpliced ? (
                  // the splice auto-sequences source → ad → source; no scrubbing.
                  <span className="flex flex-1 items-center gap-2 text-[13px] font-semibold text-fog">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-coral" />
                    Native ad splices in at <span className="font-bold tabular text-coral">{fmt(startAt)}</span>, then loops back to source — seamless.
                  </span>
                ) : (
                  <>
                    <span className="w-10 text-[12px] font-bold tabular text-fog">{fmt(progress * dur)}</span>
                    <button
                      className="group relative h-2.5 flex-1 cursor-pointer rounded-full bg-ink-3"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        seek((e.clientX - r.left) / r.width);
                      }}
                    >
                      <div className="absolute inset-y-0 left-0 rounded-full bg-coral" style={{ width: `${progress * 100}%` }} />

                      {/* ── native-ad placement marker: the moment + the 5s splice window ── */}
                      {dur > 0 && (() => {
                        const aStart = Math.max(0, Math.min(startAt, dur));
                        const startPct = (aStart / dur) * 100;
                        const widthPct = (Math.min(AD_LEN, dur - aStart) / dur) * 100;
                        return (
                          <>
                            {/* the window the generated cut splices into */}
                            <div
                              className="pointer-events-none absolute inset-y-0 z-[1] rounded-full bg-sun/30 ring-2 ring-inset ring-sun/60"
                              style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                            />
                            {/* flag pinned at the anchor — visible even over the played fill */}
                            <span
                              className="group/ad absolute -top-1.5 bottom-0 z-[2] flex w-3.5 -translate-x-1/2 cursor-pointer justify-center"
                              style={{ left: `${startPct}%` }}
                            >
                              <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-chalk" />
                              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-md bg-coral px-1.5 py-px text-[8px] font-bold leading-tight tracking-wide text-white">
                                AD
                              </span>
                              <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-chalk px-2 py-1 text-[10px] font-bold text-ink opacity-0 shadow-lg transition-opacity duration-150 group-hover/ad:opacity-100">
                                Native ad · <span className="tabular text-coral">{fmt(aStart)}</span>
                              </span>
                            </span>
                          </>
                        );
                      })()}

                      <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-coral bg-chalk opacity-0 shadow transition-opacity group-hover:opacity-100" style={{ left: `${progress * 100}%` }} />
                    </button>
                    <span className="w-10 text-right text-[12px] font-bold tabular text-fog-2">{fmt(dur)}</span>
                  </>
                )}

                <button onClick={toggleMute} className="ring-focus grid h-10 w-10 place-items-center rounded-full border-2 border-line-2 text-fog transition-colors hover:text-chalk" title={heroMuted ? "Unmute" : "Mute"}>
                  {heroMuted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m22 9-6 6M16 9l6 6" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
                  )}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEpoch((e) => e + 1)} className="btn-pop ring-focus inline-flex h-11 items-center gap-2 rounded-full bg-coral px-5 text-[14px] font-bold text-white" style={{ ["--pop" as string]: "rgba(180,58,18,0.95)" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                  Restart
                </button>
                <span className="flex-1 text-[13px] font-semibold text-fog-2">
                  Embedded preview loops muted for frame-level sync. Upload an MP4 to splice the ad seamlessly into the source.
                </span>
              </>
            )}
          </motion.div>
        </div>

        {/* ── the three native ads ── */}
        <div className="flex flex-col gap-3">
          <span className="px-0.5 text-[12px] font-bold uppercase tracking-wide text-fog-2">
            Native ads · {brands.length}
          </span>
          {brands.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <AdSideCard
                brand={b}
                index={i}
                selected={b.id === selectedBrand.id}
                job={displayJobs[b.id]}
                frameUrl={analysis.frame.url}
                onSelect={() => setSelectedBrandId(b.id)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- one native-ad card in the side rail ---- */
function AdSideCard({
  brand, index, selected, job, frameUrl, onSelect,
}: {
  brand: Brand;
  index: number;
  selected: boolean;
  job?: JobState;
  frameUrl: string;
  onSelect: () => void;
}) {
  const generated = job?.job?.videoUrl ?? null;
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`ring-focus group relative block w-full overflow-hidden rounded-2xl border-[2.5px] bg-ink-2 text-left transition-all ${
        selected ? "" : "border-line-2 opacity-85 hover:opacity-100 hover:border-fog/40"
      }`}
      style={selected ? { borderColor: brand.color, boxShadow: `0 5px 0 0 ${brand.color}` } : undefined}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-ink-3">
        {generated ? (
          <video src={generated} autoPlay muted loop playsInline className="h-full w-full object-cover" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frameUrl} alt="" className="h-full w-full object-cover opacity-30" />
            {job?.pending ? (
              <KlingLoader state={job} color={brand.color} compact />
            ) : (
              <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-fog-2">
                No ad yet
              </span>
            )}
          </>
        )}

        {job && !(job.pending && !generated) && <GenStatusPill state={job} compact />}

        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-ink-2/95 px-2 py-0.5 text-[9px] font-bold text-chalk backdrop-blur">
          Cut {index + 1}
        </span>

        {selected && (
          <span
            className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
            style={{ background: brand.color }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12a7 7 0 0 0 7 7" /><path d="m13 2-3 7h6l-3 7" /></svg>
            Playing
          </span>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg font-display text-[12px] font-bold text-white" style={{ background: brand.color }}>
            {brand.name[0]}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold leading-none text-chalk">{brand.name}</div>
            <div className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-fog-2">{brand.category}</div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold" style={{ color: brand.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: brand.color }} /> Live
        </span>
      </div>
    </button>
  );
}

/* ---- per-tile generation status (provider · state · seamless badge) ---- */
function GenStatusPill({ state, compact = false }: { state: JobState; compact?: boolean }) {
  const job = state.job;
  const status = state.error ? "failed" : job?.status ?? "queued";
  const pct = Math.round((job?.progress ?? 0) * 100);
  const tone = status === "succeeded" ? "#3fbf6a" : status === "failed" ? "#ff5d77" : "#ff6a3d";
  const label = state.error
    ? state.error
    : status === "queued"
      ? "Queued"
      : status === "processing"
        ? `Rendering ${pct}%`
        : status === "succeeded"
          ? job?.provider === "mock" ? "Mock · Kling-ready" : "Done"
          : "—";
  return (
    <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-2/95 px-2 py-0.5 text-[9px] font-bold text-chalk backdrop-blur"
        style={{ boxShadow: `inset 3px 0 0 0 ${tone}` }}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${state.pending ? "animate-pulse" : ""}`} style={{ background: tone }} />
        {job?.provider ? `${job.provider.toUpperCase()} · ` : ""}{label}
      </span>
      {!compact && (
        <span className="rounded-full bg-ink-2/95 px-2 py-0.5 text-[8px] font-bold text-fog-2 backdrop-blur">
          Seamless · 1st = last frame
        </span>
      )}
    </div>
  );
}

/* ---- spinning-wheel loading screen shown while Kling renders a cut ----
   Covers the media with a soft scrim + a brand-colored spinner while the job is
   pending (POST → queued → processing) and no video has landed yet. `compact`
   is the small variant for the side-rail tiles. */
function KlingLoader({ state, color, compact = false }: { state: JobState; color: string; compact?: boolean }) {
  const failed = !!state.error || state.job?.status === "failed";
  const status = state.job?.status ?? "queued";
  const pct = Math.max(4, Math.round((state.job?.progress ?? 0) * 100));
  const headline = failed
    ? "Render failed"
    : status === "processing"
      ? "Rendering your ad"
      : status === "queued"
        ? "Queued at Kling"
        : "Sending to Kling";
  const sub = failed
    ? state.error ?? "Try regenerating"
    : status === "processing"
      ? `${pct}%`
      : "Warming up the model…";

  if (failed) {
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-black/65 backdrop-blur-md">
        <div className="flex max-w-[80%] flex-col items-center gap-2 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#FF6B5E]/20 text-[#FF6B5E]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          </span>
          <span className="font-display text-[13px] font-semibold text-white">{headline}</span>
          <span className="text-[11px] leading-snug text-white/70">{sub}</span>
        </div>
      </div>
    );
  }

  const ring = compact ? "h-9 w-9" : "h-16 w-16";
  const border = compact ? "3px" : "4px";
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 backdrop-blur-md">
      <div className="flex flex-col items-center gap-3">
        <span
          className={`${ring} animate-spin rounded-full`}
          style={{ border: `${border} solid rgba(255,255,255,0.18)`, borderTopColor: color, animationDuration: "0.8s" }}
        />
        {!compact ? (
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-[14px] font-semibold text-white">{headline} ✨</span>
            <span className="text-[11px] tracking-wide text-white/70">{sub}</span>
          </div>
        ) : (
          status === "processing" && <span className="text-[9px] font-semibold tracking-wide text-white/85">{pct}%</span>
        )}
      </div>
    </div>
  );
}

/* ---- seamless splice: source → generated insert @ anchor → source, looped ----
   Two stacked <video>s. We play a short pre-roll of the source up to the anchor,
   hard-cut to the generated insert (its first frame === the source frame there),
   and when the insert ends, return to the source at the anchor and play a short
   post-roll — then loop. The cuts are invisible because both ends are the same
   frame, which is exactly the "returns to the video normally" effect. */
const PRE_ROLL = 2.5; // seconds of source shown before the insert
const POST_ROLL = 2.5; // seconds of source shown after the insert

function SplicePreview({
  srcUrl, adUrl, at, paused = false, muted = true,
}: {
  srcUrl: string;
  adUrl: string;
  at: number;
  paused?: boolean;
  muted?: boolean;
}) {
  const srcRef = useRef<HTMLVideoElement>(null);
  const adRef = useRef<HTMLVideoElement>(null);
  const phaseRef = useRef<"pre" | "ad" | "post">("pre");
  const pausedRef = useRef(paused);
  const rafRef = useRef<number | null>(null);
  const [showAd, setShowAd] = useState(false);

  // keep the latest paused flag readable inside the phase transitions
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const src = srcRef.current;
    const ad = adRef.current;
    if (!src || !ad) return;
    const start = Math.max(0, at - PRE_ROLL);
    const playActive = (v: HTMLVideoElement) => { if (!pausedRef.current) v.play().catch(() => {}); };

    const toPre = () => {
      phaseRef.current = "pre";
      setShowAd(false);
      try { ad.pause(); ad.currentTime = 0; } catch {}
      try { src.currentTime = start; } catch {}
      playActive(src);
    };
    const toAd = () => {
      phaseRef.current = "ad";
      setShowAd(true);
      try { src.pause(); } catch {}
      try { ad.currentTime = 0; } catch {}
      playActive(ad);
    };
    const toPost = () => {
      phaseRef.current = "post";
      setShowAd(false);
      try { ad.pause(); } catch {}
      try { src.currentTime = at; } catch {}
      playActive(src);
    };

    const onAdEnded = () => { if (phaseRef.current === "ad") toPost(); };
    const onAdError = () => { if (phaseRef.current === "ad") toPost(); }; // clip URL failed → don't freeze
    ad.addEventListener("ended", onAdEnded);
    ad.addEventListener("error", onAdError);

    const tick = () => {
      const p = phaseRef.current;
      if (p === "pre" && src.currentTime >= at) toAd();
      else if (p === "post" && src.currentTime >= Math.min(at + POST_ROLL, src.duration || at + POST_ROLL)) toPre();
      rafRef.current = requestAnimationFrame(tick);
    };

    src.muted = muted; ad.muted = muted;
    const begin = () => toPre();
    if (src.readyState >= 1) begin();
    else src.addEventListener("loadedmetadata", begin, { once: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ad.removeEventListener("ended", onAdEnded);
      ad.removeEventListener("error", onAdError);
      src.removeEventListener("loadedmetadata", begin);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl, adUrl, at]);

  // live mute toggle
  useEffect(() => {
    if (srcRef.current) srcRef.current.muted = muted;
    if (adRef.current) adRef.current.muted = muted;
  }, [muted]);

  // live pause / resume of whichever video is on screen
  useEffect(() => {
    const src = srcRef.current;
    const ad = adRef.current;
    if (!src || !ad) return;
    const active = phaseRef.current === "ad" ? ad : src;
    if (paused) active.pause();
    else active.play().catch(() => {});
  }, [paused]);

  return (
    <div className="absolute inset-0">
      <video ref={srcRef} src={srcUrl} muted={muted} playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: showAd ? 0 : 1 }} />
      <video ref={adRef} src={adUrl} muted={muted} playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: showAd ? 1 : 0 }} />
      <span
        className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-ink-2/95 px-2.5 py-1 text-[10px] font-bold backdrop-blur transition-colors"
        style={{ color: showAd ? "var(--color-coral)" : "var(--color-fog)" }}
      >
        {showAd ? "● Native ad" : "▶ Source"}
      </span>
    </div>
  );
}
