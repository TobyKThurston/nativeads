"use client";

import { motion } from "motion/react";
import { Button, ArrowRight } from "./ui/Button";
import { fmtTime, type AnalysisResult, type ScoredSurface } from "@/lib/analyze";

const CORAL = "#ff6a3d";
const SKY = "#2fa8e6";

const METRIC_LABELS: { key: keyof ScoredSurface["metrics"]; label: string }[] = [
  { key: "area", label: "Visible area" },
  { key: "flatness", label: "Flatness" },
  { key: "centrality", label: "Centrality" },
  { key: "duration", label: "Time on screen" },
  { key: "nativeness", label: "Native feel" },
];

export function Detection({
  analysis,
  onNext,
}: {
  analysis: AnalysisResult;
  onNext: () => void;
}) {
  const { frame, surfaces, primary, timestamp, confidence } = analysis;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 px-6 py-12 lg:grid-cols-[1.55fr_1fr]">
      {/* Frame at the selected moment */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative aspect-video w-full overflow-hidden rounded-3xl border-[3px] border-line-2 bg-ink-3"
        style={{ boxShadow: "0 8px 0 0 rgba(40,33,22,0.07)" }}
      >
        {frame.url ? (
          <img src={frame.url} alt="Selected frame" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#2a2620,#16130d)" }} />
        )}

        {surfaces.map((s, i) => (
          <DetectionBox key={s.id} s={s} index={i} />
        ))}

        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-ink-2/95 px-3 py-1.5 shadow-sm backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-coral" />
          <span className="text-[12px] font-bold text-chalk">Best spot · {fmtTime(timestamp)}</span>
        </div>
        <div className="absolute right-3 top-3 rounded-2xl bg-ink-2/95 px-3 py-1.5 text-right shadow-sm backdrop-blur">
          <div className="text-[9px] font-bold uppercase tracking-wide text-fog">Confidence</div>
          <div className="font-display text-[18px] font-bold leading-none tabular text-coral">{(confidence * 100).toFixed(1)}%</div>
        </div>
      </motion.div>

      {/* Panel */}
      <div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/15 px-3.5 py-1.5 text-[13px] font-bold text-coral">
            🎯 Step 2 · Best spot
          </span>
          <h2 className="mt-4 font-display text-[clamp(26px,3.4vw,38px)] font-bold leading-[1.04] tracking-tight text-chalk">
            We found the perfect spot.
          </h2>
          <p className="mt-3 max-w-md text-[15.5px] font-medium leading-relaxed text-fog">
            Out of the whole clip, <span className="font-bold text-chalk">{fmtTime(timestamp)}</span> scored
            highest. The <span className="font-bold text-chalk">{primary.label.toLowerCase()}</span> won on
            flatness, centrality and how native it feels.
          </p>
        </motion.div>

        {/* primary surface metric breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-5 rounded-3xl border-[2.5px] border-coral/40 bg-coral/[0.05] p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[14px] font-bold text-coral">⭐ {primary.label}</span>
            <span className="font-display text-[16px] font-bold tabular text-coral">{(primary.score * 100).toFixed(0)}</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {METRIC_LABELS.map((m, i) => (
              <div key={m.key} className="flex items-center gap-3">
                <span className="w-28 text-[12.5px] font-semibold text-fog">{m.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-3">
                  <motion.div
                    className="h-full rounded-full bg-coral"
                    initial={{ width: 0 }}
                    animate={{ width: `${primary.metrics[m.key] * 100}%` }}
                    transition={{ delay: 0.35 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="w-7 text-right text-[12px] font-bold tabular text-fog">{(primary.metrics[m.key] * 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* other surfaces */}
        <div className="mt-3 flex flex-col gap-2">
          {surfaces.slice(1, 4).map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.07 }}
              className="flex items-center gap-3 rounded-2xl border-2 border-line bg-ink-2 px-4 py-2.5"
            >
              <span className="text-[13.5px] font-bold text-chalk">{s.label}</span>
              <div className="ml-auto h-2 w-24 overflow-hidden rounded-full bg-ink-3">
                <div className="h-full rounded-full bg-sky" style={{ width: `${s.score * 100}%` }} />
              </div>
              <span className="w-7 text-right text-[12px] font-bold tabular text-fog">{(s.score * 100).toFixed(0)}</span>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-7">
          <Button onClick={onNext}>
            Pick brands <ArrowRight />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function DetectionBox({ s, index }: { s: ScoredSurface; index: number }) {
  const color = s.primary ? CORAL : SKY;
  const showLabel = s.primary || s.score > 0.5;
  return (
    <motion.div
      className="absolute"
      style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: s.primary ? 1 : 0.4 + s.score * 0.4, scale: 1 }}
      transition={{ delay: 0.4 + index * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          border: `3px solid ${color}`,
          boxShadow: s.primary ? `0 0 0 4px ${color}33` : "none",
          background: s.primary ? "rgba(255,106,61,0.08)" : "transparent",
        }}
      />
      {showLabel && (
        <span
          className="absolute -top-[26px] left-0 flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
          style={{ background: color }}
        >
          {s.label} · {(s.score * 100).toFixed(0)}
        </span>
      )}
    </motion.div>
  );
}
