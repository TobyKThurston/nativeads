/** Warm paper backdrop: cream base + faint speckle + a few drifting confetti
 *  sprinkles. Deliberately light — no grain, glows or vignette. */
export function Background() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-ink" />
      <div className="paper-speckle pointer-events-none fixed inset-0 -z-10 opacity-90" />
      <Confetti className="-z-10" />
    </>
  );
}

type Sprinkle = { shape: ShapeName; x: string; y: string; c: string; s: number; spin: number; delay: number };

// Hand-placed so the scatter feels designed, not random. Brand-pop palette.
const FIELD: Sprinkle[] = [
  { shape: "plus", x: "8%", y: "22%", c: "var(--color-coral)", s: 20, spin: -12, delay: 0 },
  { shape: "squiggle", x: "16%", y: "68%", c: "var(--color-sky)", s: 26, spin: 8, delay: 0.6 },
  { shape: "dot", x: "5%", y: "48%", c: "var(--color-sun)", s: 12, spin: 0, delay: 1.1 },
  { shape: "cross", x: "12%", y: "88%", c: "var(--color-leaf)", s: 16, spin: 14, delay: 0.3 },
  { shape: "spark", x: "90%", y: "18%", c: "var(--color-grape)", s: 22, spin: -6, delay: 0.9 },
  { shape: "ring", x: "94%", y: "54%", c: "var(--color-cherry)", s: 18, spin: 0, delay: 1.4 },
  { shape: "plus", x: "86%", y: "82%", c: "var(--color-sun)", s: 18, spin: 10, delay: 0.5 },
  { shape: "squiggle", x: "95%", y: "88%", c: "var(--color-leaf)", s: 24, spin: -10, delay: 1.2 },
  { shape: "dot", x: "82%", y: "40%", c: "var(--color-coral)", s: 11, spin: 0, delay: 0.2 },
];

/** A scattered confetti field. Pass extra classes (e.g. z-index / opacity). */
export function Confetti({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none fixed inset-0 ${className}`} aria-hidden>
      {FIELD.map((p, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: p.x,
            top: p.y,
            ["--spin" as string]: `${p.spin}deg`,
            animation: `float-slow ${6 + (i % 4)}s ease-in-out ${p.delay}s infinite`,
          }}
        >
          <Shape name={p.shape} size={p.s} color={p.c} />
        </span>
      ))}
    </div>
  );
}

type ShapeName = "plus" | "cross" | "dot" | "ring" | "spark" | "squiggle";

function Shape({ name, size, color }: { name: ShapeName; size: number; color: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const };
  const stroke = { stroke: color, strokeWidth: 3.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "plus":
      return <svg {...common}><path d="M12 4v16M4 12h16" {...stroke} /></svg>;
    case "cross":
      return <svg {...common}><path d="M6 6l12 12M18 6L6 18" {...stroke} /></svg>;
    case "dot":
      return <svg {...common}><circle cx="12" cy="12" r="7" fill={color} /></svg>;
    case "ring":
      return <svg {...common}><circle cx="12" cy="12" r="7.5" {...stroke} /></svg>;
    case "spark":
      return <svg {...common}><path d="M12 3c.6 5 3.9 8.3 9 9-5.1.7-8.4 4-9 9-.6-5-3.9-8.3-9-9 5.1-.7 8.4-4 9-9Z" fill={color} /></svg>;
    case "squiggle":
      return <svg {...common}><path d="M3 15c3-6 6 6 9 0s6 6 9 0" {...stroke} /></svg>;
  }
}
