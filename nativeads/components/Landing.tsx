"use client";

import { motion } from "motion/react";
import { UploadPanel } from "./UploadPanel";
import type { VideoSource } from "@/lib/types";

const pop = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.07 * i, duration: 0.55, ease: [0.34, 1.56, 0.64, 1] as const },
  }),
};

const STEPS: { n: string; emoji: string; label: string; color: string }[] = [
  { n: "1", emoji: "🎯", label: "We find the best spot", color: "var(--color-coral)" },
  { n: "2", emoji: "🎨", label: "You pick the brands", color: "var(--color-grape)" },
  { n: "3", emoji: "✨", label: "Three cuts render", color: "var(--color-leaf)" },
];

export function Landing({ onSubmit }: { onSubmit: (s: VideoSource) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-14 text-center lg:py-20">
      {/* playful badge */}
      <motion.span
        custom={0} variants={pop} initial="hidden" animate="show"
        className="inline-flex items-center gap-2 rounded-full border-2 border-line-2 bg-ink-2 px-4 py-1.5 text-[13px] font-bold text-chalk"
        style={{ boxShadow: "0 3px 0 0 rgba(40,33,22,0.07)" }}
      >
        <span className="text-[15px]">🎬</span> The native-ad factory
      </motion.span>

      {/* headline */}
      <motion.h1
        custom={1} variants={pop} initial="hidden" animate="show"
        className="mt-7 font-display text-[clamp(40px,8vw,72px)] font-bold leading-[0.98] tracking-tight text-chalk"
      >
        Drop a video.
        <br />
        We put the{" "}
        <span className="relative inline-block whitespace-nowrap text-coral">
          ad inside
          <svg className="absolute -bottom-1.5 left-0 w-full" height="10" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden>
            <motion.path
              d="M3 6 Q 60 2 100 5 T 197 5" stroke="var(--color-sun)" strokeWidth="5" fill="none" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 0.7, ease: "easeOut" }}
            />
          </svg>
        </span>{" "}
        it.
      </motion.h1>

      {/* subhead */}
      <motion.p
        custom={2} variants={pop} initial="hidden" animate="show"
        className="mt-6 max-w-md text-[17px] font-medium leading-relaxed text-fog"
      >
        One clip in, three native cuts out - each brand rendered right into the real
        frame. No editing suite, no green screen.
      </motion.p>

      {/* upload */}
      <motion.div custom={3} variants={pop} initial="hidden" animate="show" className="mt-9 w-full max-w-lg">
        <UploadPanel onSubmit={onSubmit} />
      </motion.div>

      {/* steps */}
      <motion.div
        custom={4} variants={pop} initial="hidden" animate="show"
        className="mt-9 flex flex-wrap items-center justify-center gap-2.5"
      >
        {STEPS.map((s) => (
          <span
            key={s.n}
            className="inline-flex items-center gap-2 rounded-full bg-ink-2 px-3.5 py-2 text-[13.5px] font-bold text-chalk"
            style={{ boxShadow: "0 3px 0 0 rgba(40,33,22,0.07)" }}
          >
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold text-white"
              style={{ background: s.color }}
            >
              {s.n}
            </span>
            <span className="text-[15px]">{s.emoji}</span>
            {s.label}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
