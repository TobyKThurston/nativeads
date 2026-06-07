/**
 * Kling provider adapter - SERVER ONLY (imports node:crypto, reads secrets).
 *
 * Routes a built KlingRequest to Kling AI's image-to-video API. The key isn't
 * provisioned yet, so in practice `isKlingConfigured()` is false and the route
 * falls back to mock mode - but this is the real call path, ready the moment
 * KLING_ACCESS_KEY / KLING_SECRET_KEY land in the environment.
 *
 * Auth is a short-lived HS256 JWT signed with the secret key (Kling's scheme).
 * Endpoint/model/mode are all env-overridable because the exact values depend
 * on the account's region and plan - confirm against the Kling docs when wiring
 * the live key.
 */

import { createHmac } from "node:crypto";
import type { GenStatus, KlingRequest } from "../generation";

export class KlingNotConfiguredError extends Error {
  constructor() {
    super("Kling is not configured (set KLING_ACCESS_KEY and KLING_SECRET_KEY)");
    this.name = "KlingNotConfiguredError";
  }
}

export class KlingApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "KlingApiError";
  }
}

type KlingConfig = {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
  model: string;
  mode: "std" | "pro";
  cfgScale: number;
};

export function isKlingConfigured(): boolean {
  return Boolean(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY);
}

export function klingConfig(): KlingConfig {
  if (!isKlingConfigured()) throw new KlingNotConfiguredError();
  // Default pro: image_tail (seamless last frame) is pro-only; std would 400.
  const mode = process.env.KLING_MODE === "std" ? "std" : "pro";
  const cfgScale = Number(process.env.KLING_CFG_SCALE);
  return {
    accessKey: process.env.KLING_ACCESS_KEY!,
    secretKey: process.env.KLING_SECRET_KEY!,
    baseUrl: (process.env.KLING_BASE_URL || "https://api-singapore.klingai.com").replace(/\/+$/, ""),
    model: process.env.KLING_MODEL || "kling-v3",
    mode,
    // 0.7 (not Kling's 0.5 default): higher cfg_scale = stricter prompt adherence,
    // so Kling actually renders the product/logo the prompt asks for. Env-overridable.
    cfgScale: Number.isFinite(cfgScale) ? cfgScale : 0.7,
  };
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Short-lived JWT (HS256), per Kling's API auth scheme. */
function signJwt(cfg: KlingConfig, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: cfg.accessKey, exp: nowSec + 1800, nbf: nowSec - 5 }));
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac("sha256", cfg.secretKey).update(data).digest());
  return `${data}.${sig}`;
}

function authHeaders(cfg: KlingConfig): HeadersInit {
  const jwt = signJwt(cfg, Math.floor(Date.now() / 1000));
  return { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };
}

/** Map Kling's task_status vocabulary onto our GenStatus. */
function mapStatus(s: string | undefined): GenStatus {
  switch (s) {
    case "succeed":
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "processing":
      return "processing";
    default:
      return "queued"; // "submitted" and anything unknown
  }
}

type KlingEnvelope<T> = { code?: number; message?: string; data?: T };

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as KlingEnvelope<T>;
  if (!res.ok) throw new KlingApiError(body?.message || `Kling HTTP ${res.status}`, res.status);
  if (typeof body.code === "number" && body.code !== 0) {
    throw new KlingApiError(body.message || `Kling error code ${body.code}`, res.status);
  }
  return body.data as T;
}

/** Submit an image2video task. Returns the Kling task id. */
export async function createImage2Video(
  req: KlingRequest
): Promise<{ taskId: string; status: GenStatus; message?: string }> {
  const cfg = klingConfig();
  const res = await fetch(`${cfg.baseUrl}/v1/videos/image2video`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(req),
    cache: "no-store",
  });
  const data = await readEnvelope<{ task_id: string; task_status?: string }>(res);
  if (!data?.task_id) throw new KlingApiError("Kling did not return a task id");
  return { taskId: data.task_id, status: mapStatus(data.task_status) };
}

/** Poll an image2video task; returns the video URL once it succeeds. */
export async function queryImage2Video(
  taskId: string
): Promise<{ status: GenStatus; videoUrl: string | null; message?: string }> {
  const cfg = klingConfig();
  const res = await fetch(`${cfg.baseUrl}/v1/videos/image2video/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: authHeaders(cfg),
    cache: "no-store",
  });
  const data = await readEnvelope<{
    task_status?: string;
    task_status_msg?: string;
    task_result?: { videos?: Array<{ url?: string }> };
  }>(res);
  const status = mapStatus(data?.task_status);
  const videoUrl = data?.task_result?.videos?.[0]?.url ?? null;
  return { status, videoUrl, message: data?.task_status_msg };
}
