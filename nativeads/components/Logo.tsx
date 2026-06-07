export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span
        className="relative grid h-9 w-9 place-items-center rounded-2xl bg-coral text-white"
        style={{ boxShadow: "0 3px 0 0 rgba(180,58,18,0.9)" }}
      >
        {/* viewfinder + play = "drop a video in" mark */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M2 5.5V3.2A1.2 1.2 0 0 1 3.2 2H5.5M12.5 2h2.3A1.2 1.2 0 0 1 16 3.2V5.5M16 12.5v2.3a1.2 1.2 0 0 1-1.2 1.2H12.5M5.5 16H3.2A1.2 1.2 0 0 1 2 14.8V12.5"
            stroke="#fff" strokeWidth="1.7" strokeLinecap="round"
          />
          <path d="M7.4 6.3v5.4a.5.5 0 0 0 .77.42l4.2-2.7a.5.5 0 0 0 0-.84l-4.2-2.7a.5.5 0 0 0-.77.42Z" fill="#fff" />
        </svg>
      </span>
      <span className="font-display text-[19px] font-bold tracking-tight text-chalk">
        NativeAds
      </span>
    </div>
  );
}
