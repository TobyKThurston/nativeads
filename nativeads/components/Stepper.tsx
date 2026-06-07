"use client";

import { motion } from "motion/react";
import type { Step } from "@/lib/types";

const FLOW: { id: Step; label: string }[] = [
  { id: "analyzing", label: "Scan" },
  { id: "detection", label: "Spot" },
  { id: "brands", label: "Brands" },
  { id: "previews", label: "Render" },
];

export function Stepper({ current }: { current: Step }) {
  const activeIndex = FLOW.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center gap-1.5">
      {FLOW.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                  active ? "bg-coral text-white" : done ? "bg-coral/20 text-coral" : "bg-ink-3 text-fog-2"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`hidden text-[13px] font-bold transition-colors sm:inline ${
                  active ? "text-chalk" : done ? "text-fog" : "text-fog-2"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < FLOW.length - 1 && (
              <div className="relative h-1.5 w-5 overflow-hidden rounded-full bg-ink-3 sm:w-8">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-coral"
                  initial={false}
                  animate={{ width: i < activeIndex ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
