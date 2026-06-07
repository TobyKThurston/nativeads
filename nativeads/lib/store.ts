/**
 * Saved-ad persistence - the gallery's backing store.
 *
 * Two tiers, by weight:
 *  - localStorage holds the lightweight record per saved ad: its metadata, the
 *    captured frame (a data URL - doubles as the gallery thumbnail), and the
 *    generated clip URLs. Synchronous, so the gallery renders instantly.
 *  - IndexedDB holds the heavy bit: the uploaded source video's bytes. A file
 *    source is only ever a `blob:` URL, which dies on reload - so to actually
 *    *replay* a saved ad we stash the blob and mint a fresh object URL on open.
 *    YouTube sources need none of this; their id is enough.
 *
 * Everything here is browser-only and guarded for SSR (no-ops on the server).
 */

import type { VideoSource } from "./types";
import type { AnalysisResult } from "./analyze";
import type { StyleId } from "./style";

/** One generated cut, as persisted. `videoUrl` is the provider's clip URL (or
 *  null when generation was mocked / never ran for that brand). */
export type SavedClip = {
  brandId: string;
  videoUrl: string | null;
  provider?: string;
};

/** A saved ad project - everything needed to re-render the previews screen. */
export type SavedAd = {
  id: string;
  createdAt: number;
  /** human label (the file name, or "YouTube clip") */
  title: string;
  /** frame data URL (file) or thumbnail URL (youtube) - the gallery tile image */
  thumb: string;
  styleId: StyleId;
  brandIds: string[];
  /** for a file source, `source.url` is a stale blob URL - rehydrate via getSourceBlob */
  source: VideoSource;
  analysis: AnalysisResult;
  clips: SavedClip[];
};

const LS_KEY = "nativeads:gallery:v1";
const IDB_NAME = "nativeads";
const IDB_STORE = "media";
const SRC_KEY = (id: string) => `src:${id}`;

const isBrowser = () => typeof window !== "undefined";

/** Stable id without leaning on Math.random where crypto is available. */
export function newId(): string {
  if (isBrowser() && "crypto" in window && "randomUUID" in crypto) return crypto.randomUUID();
  return `ad_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/* ---------------------------------------------------------------- localStorage */

/** All saved ads, newest first. Tolerant of a corrupt/missing blob. */
export function listAds(): SavedAd[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedAd[];
    if (!Array.isArray(arr)) return [];
    return [...arr].sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function getAd(id: string): SavedAd | undefined {
  return listAds().find((a) => a.id === id);
}

function writeAll(ads: SavedAd[]): void {
  window.localStorage.setItem(LS_KEY, JSON.stringify(ads));
}

/**
 * Upsert an ad. localStorage is small (~5MB) and our thumbnails are data URLs,
 * so on a quota error we drop the oldest ad and retry - best-effort, demo-grade.
 */
export function saveAd(ad: SavedAd): void {
  if (!isBrowser()) return;
  const ads = listAds().filter((a) => a.id !== ad.id);
  ads.unshift(ad);
  for (let attempt = 0; attempt < ads.length; attempt++) {
    try {
      writeAll(ads);
      return;
    } catch {
      // quota - shed the oldest and try again
      ads.pop();
    }
  }
  // last resort: just this one
  writeAll([ad]);
}

/** Remove an ad's record and its source blob. */
export async function deleteAd(id: string): Promise<void> {
  if (!isBrowser()) return;
  writeAll(listAds().filter((a) => a.id !== id));
  try {
    await idbDelete(SRC_KEY(id));
  } catch {
    /* blob may not exist (youtube) - fine */
  }
}

/* --------------------------------------------------------------- IndexedDB blobs */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser() || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

function idbPut(key: string, value: Blob): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("idb put failed"));
      })
  );
}

function idbGet(key: string): Promise<Blob | undefined> {
  return openDb().then(
    (db) =>
      new Promise<Blob | undefined>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error ?? new Error("idb get failed"));
      })
  );
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("idb delete failed"));
      })
  );
}

/** Persist the source video bytes for a file-based ad. */
export function putSourceBlob(id: string, blob: Blob): Promise<void> {
  return idbPut(SRC_KEY(id), blob);
}

/** Recover the source video bytes; undefined if never stored (e.g. youtube). */
export function getSourceBlob(id: string): Promise<Blob | undefined> {
  return idbGet(SRC_KEY(id));
}

/**
 * Recover a file-source blob URL into a *fresh, live* object URL the caller must
 * revoke when done. Returns null if there's no stored blob.
 */
export async function rehydrateSourceUrl(id: string): Promise<string | null> {
  try {
    const blob = await getSourceBlob(id);
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
