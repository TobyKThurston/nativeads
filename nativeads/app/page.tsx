"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Background } from "@/components/Background";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { Landing } from "@/components/Landing";
import { Analyzing } from "@/components/Analyzing";
import { Detection } from "@/components/Detection";
import { BrandPicker } from "@/components/BrandPicker";
import { Branching } from "@/components/Branching";
import { Previews } from "@/components/Previews";
import { Gallery } from "@/components/Gallery";
import { brandById } from "@/lib/brands";
import { useGallery } from "@/lib/useGallery";
import { newId, putSourceBlob, rehydrateSourceUrl, type SavedAd, type SavedClip } from "@/lib/store";
import type { Step, VideoSource, Brand } from "@/lib/types";
import type { StyleId } from "@/lib/style";
import type { AnalysisResult } from "@/lib/analyze";

type View = "create" | "view";

export default function Home() {
  // Home IS the new-ad page (the create-flow landing). The saved-ads gallery
  // lives at the bottom of it — no separate gallery page.
  const [view, setView] = useState<View>("create");

  // ---- create-flow state ----
  const [step, setStep] = useState<Step>("landing");
  const [source, setSource] = useState<VideoSource | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // ---- gallery + the ad currently being viewed ----
  const { ads, save, remove } = useGallery();
  const [activeAd, setActiveAd] = useState<SavedAd | null>(null);

  const brands = selected.map((id) => brandById(id)).filter(Boolean) as Brand[];

  /** Discard create-flow state (and free the blob URL). */
  const clearFlow = useCallback(() => {
    setSource((s) => {
      if (s?.kind === "file") URL.revokeObjectURL(s.url);
      return null;
    });
    setAnalysis(null);
    setSelected([]);
    setStep("landing");
  }, []);

  const goHome = useCallback(() => {
    clearFlow();
    setActiveAd(null);
    setView("create");
  }, [clearFlow]);

  const startNew = useCallback(() => {
    clearFlow();
    setActiveAd(null);
    setView("create");
  }, [clearFlow]);

  // "Start over" inside the create flow → back to landing, fresh.
  const restart = useCallback(() => clearFlow(), [clearFlow]);

  const openAd = useCallback(
    (id: string) => {
      const ad = ads.find((a) => a.id === id);
      if (!ad) return;
      setActiveAd(ad);
      setView("view");
    },
    [ads]
  );

  // Persist the current cuts as a gallery project, then return home.
  const handleSave = useCallback(
    async ({ clips, styleId }: { clips: SavedClip[]; styleId: StyleId }) => {
      if (!source || !analysis) return;
      const id = newId();
      // stash the source bytes so a file ad can replay the splice after reload
      if (source.kind === "file") {
        try {
          const blob = await fetch(source.url).then((r) => r.blob());
          await putSourceBlob(id, blob);
        } catch {
          /* best-effort; replay falls back to the standalone clip */
        }
      }
      const ad: SavedAd = {
        id,
        createdAt: Date.now(),
        title: source.kind === "file" ? source.name.replace(/\.[^.]+$/, "") : "YouTube clip",
        thumb: analysis.frame.url,
        styleId,
        brandIds: brands.map((b) => b.id),
        source,
        analysis,
        clips,
      };
      save(ad);
      goHome();
    },
    [source, analysis, brands, save, goHome]
  );

  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />

      {/* top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-line bg-ink/80 px-6 py-3 backdrop-blur-xl">
        <button onClick={goHome} className="ring-focus rounded-xl" aria-label="Home">
          <Logo />
        </button>
        <AnimatePresence>
          {view === "create" && step !== "landing" && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Stepper current={step} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="hidden w-[120px] justify-end sm:flex">
          {view === "view" ? (
            <button
              onClick={goHome}
              className="btn-pop ring-focus rounded-full border-2 border-line-2 bg-ink-2 px-4 py-1.5 text-[13px] font-bold text-chalk"
              style={{ ["--pop" as string]: "rgba(40,33,22,0.18)" }}
            >
              ← Home
            </button>
          ) : (
            <span className="rounded-full bg-ink-3 px-3 py-1.5 text-[12px] font-bold text-fog">Demo</span>
          )}
        </div>
      </header>

      {/* body */}
      <main className="flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={view === "create" ? `create:${step}` : `view:${activeAd?.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className={`flex flex-1 flex-col ${
              view === "view" ||
              (view === "create" && step === "previews") ||
              (view === "create" && step === "landing")
                ? ""
                : "justify-center"
            }`}
          >
            {view === "view" && activeAd && (
              <>
                <SavedAdView ad={activeAd} onBack={goHome} />
                <Gallery
                  ads={ads.filter((a) => a.id !== activeAd.id)}
                  onNew={startNew}
                  onOpen={openAd}
                  onDelete={remove}
                />
              </>
            )}

            {view === "create" && step === "landing" && (
              <>
                <Landing onSubmit={(s) => { setSource(s); setStep("analyzing"); }} />
                <Gallery
                  showNew={false}
                  ads={ads}
                  onNew={startNew}
                  onOpen={openAd}
                  onDelete={remove}
                />
              </>
            )}

            {view === "create" && step === "analyzing" && source && (
              <Analyzing
                source={source}
                onComplete={(r) => { setAnalysis(r); setStep("detection"); }}
              />
            )}

            {view === "create" && step === "detection" && analysis && (
              <Detection analysis={analysis} onNext={() => setStep("brands")} />
            )}

            {view === "create" && step === "brands" && (
              <BrandPicker selected={selected} setSelected={setSelected} onNext={() => setStep("branching")} />
            )}

            {view === "create" && step === "branching" && analysis && (
              <Branching frame={analysis.frame} timestamp={analysis.timestamp} brands={brands} onNext={() => setStep("previews")} />
            )}

            {view === "create" && step === "previews" && source && analysis && (
              <>
                <Previews
                  source={source}
                  analysis={analysis}
                  brands={brands}
                  onRestart={restart}
                  onSave={handleSave}
                />
                <Gallery
                  ads={ads}
                  onNew={startNew}
                  onOpen={openAd}
                  onDelete={remove}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Replay a saved ad. File sources need their bytes rehydrated from IndexedDB
   into a fresh object URL (the original blob: URL is long dead); YouTube
   sources replay straight from their id.
---------------------------------------------------------------------------- */
function SavedAdView({ ad, onBack }: { ad: SavedAd; onBack: () => void }) {
  const [source, setSource] = useState<VideoSource | null>(
    ad.source.kind === "youtube" ? ad.source : null
  );
  const [loading, setLoading] = useState(ad.source.kind === "file");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (ad.source.kind !== "file") return;
    let url: string | null = null;
    let cancelled = false;
    setLoading(true);
    rehydrateSourceUrl(ad.id).then((fresh) => {
      if (cancelled) {
        if (fresh) URL.revokeObjectURL(fresh);
        return;
      }
      if (fresh) {
        url = fresh;
        setSource({ kind: "file", url: fresh, name: ad.source.kind === "file" ? ad.source.name : "clip" });
      } else {
        setMissing(true);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ad.id, ad.source]);

  const brands = ad.brandIds.map((id) => brandById(id)).filter(Boolean) as Brand[];
  const savedClips: Record<string, string | null> = Object.fromEntries(
    ad.clips.map((c) => [c.brandId, c.videoUrl])
  );

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center py-20">
        <div className="flex flex-col items-center gap-3 text-fog">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-ink-3 border-t-coral" />
          <span className="text-[13px] font-bold">Loading your clip…</span>
        </div>
      </div>
    );
  }

  // File bytes gone (e.g. cleared by the browser): replay the standalone clips.
  if (missing && ad.clips.some((c) => c.videoUrl)) {
    return (
      <Previews
        source={{ kind: "youtube", id: "", url: "" }}
        analysis={ad.analysis}
        brands={brands}
        savedClips={savedClips}
        initialStyleId={ad.styleId}
        mode="view"
        onRestart={onBack}
        restartLabel="Back to gallery"
      />
    );
  }

  if (!source) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="font-display text-[20px] font-bold text-chalk">This clip&apos;s source video is gone 😢</p>
        <p className="mt-2 text-[14px] font-medium text-fog">Your browser may have cleared the stored media. Try making a new one.</p>
        <button
          onClick={onBack}
          className="btn-pop ring-focus mt-7 rounded-full border-2 border-line-2 bg-ink-2 px-5 py-2.5 text-[14px] font-bold text-chalk"
          style={{ ["--pop" as string]: "rgba(40,33,22,0.18)" }}
        >
          ← Back to gallery
        </button>
      </div>
    );
  }

  return (
    <Previews
      source={source}
      analysis={ad.analysis}
      brands={brands}
      savedClips={savedClips}
      initialStyleId={ad.styleId}
      mode="view"
      onRestart={onBack}
      restartLabel="Back to gallery"
    />
  );
}
