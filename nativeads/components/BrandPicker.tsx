"use client";

import { motion, AnimatePresence } from "motion/react";
import { BRANDS } from "@/lib/brands";
import { Button, ArrowRight } from "./ui/Button";

const MAX = 3;

export function BrandPicker({
  selected,
  setSelected,
  onNext,
}: {
  selected: string[];
  setSelected: (ids: string[]) => void;
  onNext: () => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < MAX) setSelected([...selected, id]);
  }

  const full = selected.length === MAX;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-grape/15 px-3.5 py-1.5 text-[13px] font-bold text-grape">
        🎨 Step 3 · Pick your brands
      </span>
      <h2 className="mx-auto mt-4 max-w-xl font-display text-[clamp(28px,4vw,42px)] font-bold leading-[1.02] tracking-tight text-chalk">
        Pick three brands to drop in.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[16px] font-medium text-fog">
        Each one becomes its own native cut — same scene, three placements.
      </p>

      {/* progress */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {Array.from({ length: MAX }).map((_, i) => (
          <span
            key={i}
            className="h-2.5 w-9 rounded-full transition-all duration-300"
            style={{ background: i < selected.length ? "var(--color-coral)" : "var(--color-ink-3)" }}
          />
        ))}
        <span className="ml-2 text-[14px] font-bold tabular text-fog">{selected.length}/{MAX}</span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3.5 text-left sm:grid-cols-3">
        {BRANDS.map((b, i) => {
          const isSel = selected.includes(b.id);
          const locked = !isSel && full;
          return (
            <motion.button
              key={b.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: locked ? 0.4 : 1, y: 0 }}
              transition={{ delay: i * 0.035, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
              whileHover={locked ? {} : { y: -4 }}
              whileTap={locked ? {} : { scale: 0.97 }}
              onClick={() => toggle(b.id)}
              disabled={locked}
              aria-pressed={isSel}
              className="ring-focus group relative overflow-hidden rounded-3xl border-[2.5px] bg-ink-2 p-4"
              style={{
                borderColor: isSel ? b.color : "var(--color-line)",
                boxShadow: isSel ? `0 6px 0 0 ${b.color}` : "0 5px 0 0 rgba(40,33,22,0.06)",
              }}
            >
              <div className="flex items-start justify-between">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl font-display text-[22px] font-bold text-white transition-transform group-hover:-rotate-6"
                  style={{ background: b.color }}
                >
                  {b.name[0]}
                </span>

                <span
                  className="grid h-7 w-7 place-items-center rounded-full border-2 transition-all"
                  style={{
                    borderColor: isSel ? b.color : "var(--color-line-2)",
                    background: isSel ? b.color : "transparent",
                  }}
                >
                  <AnimatePresence>
                    {isSel && (
                      <motion.svg
                        initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        width="14" height="14" viewBox="0 0 12 12" fill="none"
                      >
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </motion.svg>
                    )}
                  </AnimatePresence>
                </span>
              </div>

              <div className="mt-3.5">
                <div className="font-display text-[18px] font-bold leading-none text-chalk">{b.name}</div>
                <div className="mt-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: b.color }}>{b.category}</div>
                <div className="mt-2 text-[13.5px] font-medium text-fog">{b.tagline}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-9 flex flex-col items-center gap-3">
        <Button onClick={onNext} disabled={!full}>
          Make {MAX} cuts <ArrowRight />
        </Button>
        <span className="text-[14px] font-bold text-fog-2">
          {full ? "Looks great — let's go! 🎉" : `Pick ${MAX - selected.length} more`}
        </span>
      </div>
    </div>
  );
}
