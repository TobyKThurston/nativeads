"use client";

/**
 * React state over the saved-ad store. Reads localStorage once on mount (so SSR
 * renders an empty gallery, then hydrates), and keeps in sync across tabs via
 * the `storage` event.
 */

import { useCallback, useEffect, useState } from "react";
import { listAds, saveAd as persist, deleteAd as remove, type SavedAd } from "./store";

export function useGallery() {
  const [ads, setAds] = useState<SavedAd[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setAds(listAds()), []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const save = useCallback(
    (ad: SavedAd) => {
      persist(ad);
      refresh();
    },
    [refresh]
  );

  const del = useCallback(
    async (id: string) => {
      await remove(id);
      refresh();
    },
    [refresh]
  );

  return { ads, ready, save, remove: del, refresh };
}
