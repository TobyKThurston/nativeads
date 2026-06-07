"use client";

import { useState } from "react";
import type { VideoSource } from "@/lib/types";

export function UploadPanel({ onSubmit }: { onSubmit: (s: VideoSource) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function takeFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Hmm, that's not a video - try an MP4, MOV or WebM.");
      return;
    }
    setError(null);
    onSubmit({ kind: "file", url: URL.createObjectURL(file), name: file.name });
  }

  return (
    <div className="w-full">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); takeFile(e.dataTransfer.files?.[0]); }}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[28px] border-[3px] border-dashed px-6 py-14 text-center transition-all ${
          dragging
            ? "scale-[1.01] border-coral bg-coral/10"
            : "border-line-2 bg-ink-2 hover:border-coral/60 hover:bg-coral/[0.04]"
        }`}
        style={{ boxShadow: dragging ? "0 8px 0 0 rgba(40,33,22,0.08)" : "0 6px 0 0 rgba(40,33,22,0.06)" }}
      >
        <input type="file" accept="video/*" className="sr-only" onChange={(e) => takeFile(e.target.files?.[0])} />

        <span
          className={`grid h-16 w-16 place-items-center rounded-3xl text-white transition-transform group-hover:-translate-y-0.5 ${
            dragging ? "bg-coral" : "bg-coral"
          }`}
          style={{ boxShadow: "0 4px 0 0 rgba(180,58,18,0.9)" }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M5 20h14" />
          </svg>
        </span>

        <div className="font-display text-[20px] font-semibold text-chalk">
          {dragging ? "Drop it!" : "Drop a video here"}
        </div>
        <div className="text-[14px] text-fog">
          or <span className="font-bold text-coral underline decoration-coral/40 decoration-2 underline-offset-2">browse your files</span> - MP4, MOV or WebM
        </div>
        <div className="rounded-full bg-ink-3 px-3 py-1 text-[12px] font-semibold text-fog">
          🔒 Runs 100% in your browser
        </div>
      </label>

      {error && (
        <p className="mt-3 text-center text-[14px] font-semibold text-cherry">{error}</p>
      )}
    </div>
  );
}
