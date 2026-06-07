/** Extract an 11-char YouTube id from virtually any YouTube URL shape. */
export function parseYouTubeId(raw: string): string | null {
  const text = (raw || "").trim();
  if (!text) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text.includes("://") ? text : "https://" + text);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const ok =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be" ||
    host === "youtube-nocookie.com";
  if (!ok) return null;

  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.searchParams.get("v")) {
    id = url.searchParams.get("v");
  } else {
    const m = url.pathname.match(/\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) id = m[2];
  }

  return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

export const youtubeThumb = (id: string) =>
  `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

export const youtubeThumbFallback = (id: string) =>
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export function youtubeEmbed(
  id: string,
  opts: { autoplay?: boolean; mute?: boolean; loop?: boolean; controls?: boolean; start?: number } = {}
) {
  const p = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    controls: opts.controls === false ? "0" : "1",
  });
  if (opts.autoplay) p.set("autoplay", "1");
  if (opts.mute) p.set("mute", "1");
  if (opts.start && opts.start > 0) p.set("start", String(Math.floor(opts.start)));
  if (opts.loop) {
    p.set("loop", "1");
    p.set("playlist", id);
  }
  if (typeof window !== "undefined") p.set("origin", window.location.origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
}
