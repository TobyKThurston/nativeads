"use client";

import type { CSSProperties, ReactNode } from "react";

type Variant = "primary" | "dark" | "ghost";

const VARIANTS: Record<Variant, { className: string; style: CSSProperties }> = {
  // coral, white text, deep-coral pop shadow
  primary: {
    className: "bg-coral text-white",
    style: { ["--pop" as string]: "rgba(180,58,18,0.95)" },
  },
  // ink, cream text - the confident CTA (like the reference "Generate")
  dark: {
    className: "bg-chalk text-ink",
    style: { ["--pop" as string]: "rgba(0,0,0,0.32)" },
  },
  // soft white pill with a hairline - secondary actions
  ghost: {
    className: "bg-ink-2 text-chalk border-2 border-line-2",
    style: { ["--pop" as string]: "rgba(40,33,22,0.18)" },
  },
};

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: Variant;
  className?: string;
  type?: "button" | "submit";
}) {
  const v = VARIANTS[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={v.style}
      className={`btn-pop ring-focus group relative inline-flex h-12 select-none items-center justify-center gap-2 rounded-full px-7 font-display text-[16px] font-semibold disabled:opacity-45 ${v.className} ${className}`}
    >
      {children}
    </button>
  );
}

export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 16 16" fill="none"
      className={`transition-transform duration-200 group-hover:translate-x-1 ${className}`}
      aria-hidden
    >
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
