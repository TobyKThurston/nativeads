import type { Frame } from "./types";

/**
 * Grab a representative frame from an uploaded video file using an offscreen
 * <video> + <canvas>. Seeks to ~20% in (skips black intros) and returns a
 * JPEG data URL plus the intrinsic aspect ratio.
 */
export function extractFrame(fileUrl: string): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.src = fileUrl;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const fail = (e: unknown) => {
      cleanup();
      reject(e instanceof Error ? e : new Error("frame extraction failed"));
    };

    video.addEventListener("error", () => fail(new Error("video decode error")));

    video.addEventListener("loadedmetadata", () => {
      const t = Math.min(
        Math.max(0.1, (video.duration || 4) * 0.2),
        Math.max(0.1, (video.duration || 4) - 0.1)
      );
      const onSeeked = () => {
        try {
          const w = video.videoWidth || 1280;
          const h = video.videoHeight || 720;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return fail(new Error("no 2d context"));
          ctx.drawImage(video, 0, 0, w, h);
          const url = canvas.toDataURL("image/jpeg", 0.86);
          cleanup();
          resolve({ url, aspect: w / h });
        } catch (e) {
          fail(e);
        }
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      // Some browsers need a play() nudge before seek resolves.
      video.currentTime = t;
    });
  });
}
