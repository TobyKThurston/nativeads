import type { ScoredSurface } from "@/lib/analyze";

// Vision calls can take a few seconds; allow headroom on Vercel.
export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are a computer-vision system for NATIVE ad placement in video.
Given a single video frame, do two things:
1. Describe the scene in one vivid sentence ("scene"): the setting, the key objects/subjects,
   the visual medium/art style (e.g. live-action, Minecraft, anime), lighting and mood. This
   grounds a downstream video model that must insert a product natively into THIS scene.
2. Find up to 4 surfaces where a brand logo or product could be composited so it looks like it
   naturally belongs in the scene (walls, tabletops, signage, screens/monitors, apparel, floors,
   shelves). Prefer flat, unobtrusive, well-lit surfaces.
Return normalized coordinates in [0,1] with the top-left of the frame as origin.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scene: {
      type: "string",
      description:
        "One vivid sentence describing the scene: setting, key objects/subjects, visual medium/art style, lighting and mood.",
    },
    surfaces: {
      type: "array",
      description: "Candidate ad-placement surfaces, best first.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", description: "Short surface name, e.g. 'Tabletop'." },
          x: { type: "number", description: "Left edge, 0..1" },
          y: { type: "number", description: "Top edge, 0..1" },
          w: { type: "number", description: "Width, 0..1" },
          h: { type: "number", description: "Height, 0..1" },
          confidence: { type: "number", description: "Overall placement confidence, 0..1" },
          area: { type: "number", description: "Visible area score, 0..1" },
          flatness: { type: "number", description: "Surface flatness/smoothness, 0..1" },
          centrality: { type: "number", description: "Closeness to frame center, 0..1" },
          duration: { type: "number", description: "Estimated likelihood it stays on screen, 0..1" },
          nativeness: { type: "number", description: "How native an ad would feel here, 0..1" },
          rationale: { type: "string", description: "One short sentence explaining the pick." },
        },
        required: ["label", "x", "y", "w", "h", "confidence", "area", "flatness", "centrality", "duration", "nativeness", "rationale"],
      },
    },
  },
  required: ["scene", "surfaces"],
};

const clamp01 = (v: unknown) => {
  const n = typeof v === "number" && isFinite(v) ? v : 0;
  return Math.min(1, Math.max(0, n));
};

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ ok: false, reason: "missing_key" }, { status: 200 });
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const image = body.image;
  if (!image || typeof image !== "string") {
    return Response.json({ ok: false, reason: "no_image" }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "input_text", text: "Find the best native ad-placement surfaces in this frame. Best first." },
              { type: "input_image", image_url: image },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "ad_surfaces", schema: SCHEMA, strict: true } },
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return Response.json({ ok: false, reason: "openai_error", status: r.status, detail: detail.slice(0, 500) }, { status: 200 });
    }

    const data = await r.json();
    const text: string | undefined =
      data.output_text ??
      data.output?.flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
        .find((c: { type: string; text?: string }) => c.type === "output_text")?.text;

    if (!text) return Response.json({ ok: false, reason: "empty_response" }, { status: 200 });

    let parsed: { surfaces?: RawSurface[]; scene?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ ok: false, reason: "parse_error" }, { status: 200 });
    }

    const surfaces: ScoredSurface[] = (parsed.surfaces ?? []).slice(0, 6).map((s, i): ScoredSurface => {
      const x = clamp01(s.x);
      const y = clamp01(s.y);
      const w = Math.min(1 - x, clamp01(s.w) || 0.2);
      const h = Math.min(1 - y, clamp01(s.h) || 0.2);
      return {
        id: `gpt-${i}`,
        label: (s.label || `Surface ${i + 1}`).toUpperCase().slice(0, 22),
        x, y, w, h,
        score: clamp01(s.confidence),
        metrics: {
          area: clamp01(s.area),
          flatness: clamp01(s.flatness),
          centrality: clamp01(s.centrality),
          duration: clamp01(s.duration),
          nativeness: clamp01(s.nativeness),
        },
      };
    });

    if (surfaces.length === 0) return Response.json({ ok: false, reason: "no_surfaces" }, { status: 200 });

    return Response.json({
      ok: true,
      model,
      surfaces,
      scene: parsed.scene ?? "",
      rationale: parsed.surfaces?.[0]?.rationale ?? "",
    });
  } catch (e) {
    return Response.json({ ok: false, reason: "exception", detail: String(e).slice(0, 300) }, { status: 200 });
  }
}

type RawSurface = {
  label?: string;
  x?: number; y?: number; w?: number; h?: number;
  confidence?: number;
  area?: number; flatness?: number; centrality?: number; duration?: number; nativeness?: number;
  rationale?: string;
};
