"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Brand, Frame } from "@/lib/types";
import { fmtTime } from "@/lib/analyze";
import { Button, ArrowRight } from "./ui/Button";

// Layout anchors in a 1000×460 viewBox, mirrored as % for the HTML overlay.
const SRC = { x: 150, y: 230 };
const TARGETS_Y = [92, 230, 368];
const TGT_X = 840;
const pct = (v: number, span: number) => `${(v / span) * 100}%`;

export function Branching({
  frame,
  timestamp = 0,
  brands,
  onNext,
}: {
  frame: Frame;
  timestamp?: number;
  brands: Brand[];
  onNext: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 2200);
    return () => clearTimeout(t);
  }, []);

  const paths = TARGETS_Y.map(
    (ty) => `M${SRC.x} ${SRC.y} C 460 ${SRC.y}, 560 ${ty}, ${TGT_X} ${ty}`
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="mb-7 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf/15 px-3.5 py-1.5 text-[13px] font-bold text-leaf">
          🌱 Step 4 · Branching
        </span>
        <h2 className="mt-4 font-display text-[clamp(28px,4vw,42px)] font-bold leading-[1.02] tracking-tight text-chalk">
          One source, three timelines.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[16px] font-medium text-fog">
          Forking the master into personalized renders - each brand on its own track.
        </p>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-3xl border-[3px] border-line-2 bg-ink-2 p-2"
        style={{ boxShadow: "0 8px 0 0 rgba(40,33,22,0.07)" }}
      >
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative w-full" style={{ aspectRatio: "1000 / 460" }}>
          {/* connector paths */}
          <svg viewBox="0 0 1000 460" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" fill="none">
            {paths.map((d, i) => (
              <g key={i}>
                <motion.path
                  d={d}
                  stroke={brands[i]?.color ?? "#ff6a3d"}
                  strokeWidth={3}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.9 }}
                  transition={{ delay: 0.3 + i * 0.25, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                />
              </g>
            ))}
          </svg>

          {/* traveling packets */}
          {paths.map((d, i) => (
            <motion.span
              key={`p${i}`}
              className="absolute left-0 top-0 h-3 w-3 rounded-full"
              style={{
                background: brands[i]?.color,
                offsetPath: `path('${d}')`,
                boxShadow: `0 0 0 4px ${brands[i]?.color}33`,
              }}
              initial={{ offsetDistance: "0%", opacity: 0 }}
              animate={{ offsetDistance: "100%", opacity: [0, 1, 1, 0] }}
              transition={{ delay: 0.6 + i * 0.25, duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
            />
          ))}

          {/* source node */}
          <motion.div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: pct(SRC.x, 1000), top: pct(SRC.y, 460) }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="relative w-[clamp(96px,16vw,150px)] overflow-hidden rounded-2xl border-[3px] border-line-2 shadow-lg" style={{ aspectRatio: "16/9" }}>
              {frame.url ? (
                <img src={frame.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" style={{ background: "linear-gradient(160deg,#2a2620,#16130d)" }} />
              )}
            </div>
            <span className="mt-2 block text-center text-[11px] font-bold text-fog">Master · {fmtTime(timestamp)}</span>
          </motion.div>

          {/* target nodes */}
          {brands.map((b, i) => (
            <motion.div
              key={b.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: pct(TGT_X, 1000), top: pct(TARGETS_Y[i], 460) }}
              initial={{ opacity: 0, scale: 0.8, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: 1.1 + i * 0.25, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div
                className="flex items-center gap-2.5 rounded-2xl border-[2.5px] bg-ink-2 px-3 py-2"
                style={{ borderColor: b.color, boxShadow: `0 4px 0 0 ${b.color}` }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-[16px] font-bold text-white" style={{ background: b.color }}>
                  {b.name[0]}
                </span>
                <div className="pr-1">
                  <div className="text-[13px] font-bold leading-none text-chalk">{b.name}</div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: b.color }}>cut {i + 1}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        className="mt-8 flex items-center justify-center gap-4"
        initial={{ opacity: 0, y: 8 }}
        animate={ready ? { opacity: 1, y: 0 } : {}}
      >
        <Button onClick={onNext} disabled={!ready}>
          See the previews <ArrowRight />
        </Button>
      </motion.div>
    </div>
  );
}
