"use client";

/**
 * Client hook that drives generation: POST /api/generate per key, then poll
 * GET /api/generate/[id] until the job reaches a terminal state. Jobs are keyed
 * (we use the brand id) so the three cuts generate independently. Polls are
 * cancelled on unmount and superseded when the same key is regenerated.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationJob, GenerationSpec } from "./generation";

export type JobState = { job: GenerationJob | null; error: string | null; pending: boolean };

const POLL_MS = 1300;
const isTerminal = (s?: string) => s === "succeeded" || s === "failed";
const msg = (e: unknown) => (e instanceof Error ? e.message : "request failed");

export function useGeneration() {
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const aliveRef = useRef(true);
  const runRef = useRef<Record<string, number>>({}); // per-key token; bumping it cancels stale polls
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    aliveRef.current = true;
    const pending = timers.current;
    return () => {
      aliveRef.current = false;
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const generate = useCallback(async (key: string, spec: GenerationSpec) => {
    const token = (runRef.current[key] ?? 0) + 1;
    runRef.current[key] = token;
    const live = () => aliveRef.current && runRef.current[key] === token;

    const schedule = (fn: () => void) => {
      const t = setTimeout(() => {
        timers.current.delete(t);
        fn();
      }, POLL_MS);
      timers.current.add(t);
    };

    setJobs((j) => ({ ...j, [key]: { job: null, error: null, pending: true } }));

    let job: GenerationJob;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      job = data.job as GenerationJob;
    } catch (e) {
      if (live()) setJobs((j) => ({ ...j, [key]: { job: null, error: msg(e), pending: false } }));
      return;
    }
    if (!live()) return;
    setJobs((j) => ({ ...j, [key]: { job, error: null, pending: !isTerminal(job.status) } }));

    const poll = async (id: string) => {
      if (!live()) return;
      try {
        const res = await fetch(`/api/generate/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const next = data.job as GenerationJob;
        if (!live()) return;
        setJobs((j) => ({ ...j, [key]: { job: next, error: null, pending: !isTerminal(next.status) } }));
        if (!isTerminal(next.status)) schedule(() => poll(id));
      } catch (e) {
        if (live()) setJobs((j) => ({ ...j, [key]: { job, error: msg(e), pending: false } }));
      }
    };
    if (!isTerminal(job.status)) schedule(() => poll(job.id));
  }, []);

  const reset = useCallback(() => {
    for (const k of Object.keys(runRef.current)) runRef.current[k] = (runRef.current[k] ?? 0) + 1;
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    setJobs({});
  }, []);

  return { jobs, generate, reset };
}
