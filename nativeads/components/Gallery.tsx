"use client";

import { AnimatePresence, motion } from "motion/react";
import type { SavedAd } from "@/lib/store";
import { brandById } from "@/lib/brands";
import { styleById } from "@/lib/style";

/** "3m ago" / "2h ago" / "Apr 12" — compact, demo-grade relative time. */
function ago(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The saved-ads library — a friendly strip at the bottom of the new-ad page
 * (and below a result / a replayed cut).
 */
export function Gallery({
  ads,
  onNew,
  onOpen,
  onDelete,
  showNew = true,
}: {
  ads: SavedAd[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** hide the "New ad" button — e.g. on the landing page, where the upload
   *  hero above is already the new-ad entry point */
  showNew?: boolean;
}) {
  const empty = ads.length === 0;

  return (
    <section className="mx-auto mt-6 w-full max-w-6xl border-t-2 border-line px-6 pb-16 pt-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sun/20 px-3 py-1 text-[12px] font-bold text-chalk">
            📁 Your library
          </span>
          <h3 className="mt-2.5 font-display text-[22px] font-bold leading-tight tracking-tight text-chalk">
            {empty ? "Saved cuts land here" : `Saved cuts · ${ads.length}`}
          </h3>
        </div>
        {showNew && (
          <button
            onClick={onNew}
            className="btn-pop ring-focus hidden shrink-0 items-center gap-2 rounded-full bg-chalk px-4 py-2.5 text-[13.5px] font-bold text-ink sm:inline-flex"
            style={{ ["--pop" as string]: "rgba(0,0,0,0.3)" }}
          >
            <PlusIcon size={15} /> New ad
          </button>
        )}
      </div>

      {empty ? (
        <p className="rounded-3xl border-[2.5px] border-dashed border-line-2 bg-ink-2 px-4 py-9 text-center text-[14px] font-semibold text-fog-2">
          Nothing saved yet — hit “Save to gallery” to keep a render 💾
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {ads.map((ad, i) => (
              <AdCard key={ad.id} ad={ad} index={i} onOpen={onOpen} onDelete={onDelete} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

/* ---- one saved-ad tile ---- */
function AdCard({
  ad,
  index,
  onOpen,
  onDelete,
}: {
  ad: SavedAd;
  index: number;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const style = styleById(ad.styleId);
  const rendered = ad.clips.filter((c) => c.videoUrl).length;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      className="card-pop group relative overflow-hidden rounded-3xl border-[2.5px] border-line-2 bg-ink-2"
      style={{ boxShadow: "0 5px 0 0 rgba(40,33,22,0.06)" }}
    >
      <button
        onClick={() => onOpen(ad.id)}
        className="ring-focus block w-full text-left"
        aria-label={`Open ${ad.title}`}
      >
        {/* thumbnail */}
        <div className="relative aspect-video w-full overflow-hidden bg-ink-3">
          {ad.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.thumb}
              alt={ad.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-fog-2">
              <span className="text-[12px] font-bold">No preview</span>
            </div>
          )}

          {/* play affordance on hover */}
          <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-coral text-white glow-lime">
              <svg width="18" height="18" viewBox="0 0 14 14" fill="currentColor">
                <path d="M3 1.8v10.4a.8.8 0 0 0 1.23.67l8-5.2a.8.8 0 0 0 0-1.34l-8-5.2A.8.8 0 0 0 3 1.8Z" />
              </svg>
            </span>
          </div>

          {/* brand dots */}
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
            {ad.brandIds.slice(0, 4).map((id) => {
              const b = brandById(id);
              return (
                <span
                  key={id}
                  title={b?.name ?? id}
                  className="grid h-6 w-6 place-items-center rounded-lg font-display text-[11px] font-bold text-white ring-2 ring-ink-2"
                  style={{ background: b?.color ?? "#888" }}
                >
                  {(b?.name ?? id)[0]}
                </span>
              );
            })}
          </div>

          {/* clip count + style */}
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-ink-2/95 px-2.5 py-1 text-[10px] font-bold text-chalk backdrop-blur">
            {rendered > 0 ? `${rendered} cut${rendered === 1 ? "" : "s"}` : "Composite"}
          </span>
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-coral px-2.5 py-1 text-[10px] font-bold text-white">
            {style?.label?.split(" ")[0] ?? ad.styleId}
          </span>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold leading-tight text-chalk">{ad.title}</div>
            <div className="mt-1 text-[11px] font-semibold text-fog-2">
              {ad.source.kind === "youtube" ? "YouTube" : "Upload"} · {ago(ad.createdAt)}
            </div>
          </div>
        </div>
      </button>

      {/* delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${ad.title}"? This can't be undone.`)) onDelete(ad.id);
        }}
        title="Delete"
        aria-label="Delete"
        className="ring-focus absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-ink-2/95 text-fog opacity-0 backdrop-blur transition-all hover:bg-cherry hover:text-white group-hover:opacity-100"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </motion.div>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
