/**
 * Client entry point for card analysis. Prefers a Web Worker (keeps the UI
 * thread free); falls back to running the pipeline on the main thread if
 * workers are unavailable or the worker fails to boot.
 */

import { analyzeCard, type ProgressFn, type ScanResult } from "./analyze";
import type { WorkerResponse } from "./analysisWorker";

export async function runAnalysis(
  front: Blob,
  back: Blob,
  onProgress: ProgressFn
): Promise<ScanResult> {
  if (typeof Worker !== "undefined") {
    try {
      return await runInWorker(front, back, onProgress);
    } catch (err) {
      console.warn("Worker analysis failed, falling back to main thread:", err);
    }
  }
  return analyzeCard(front, back, onProgress);
}

function runInWorker(
  front: Blob,
  back: Blob,
  onProgress: ProgressFn
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./analysisWorker.ts", import.meta.url));
    } catch (err) {
      reject(err);
      return;
    }

    const done = (fn: () => void) => {
      worker.terminate();
      fn();
    };

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") onProgress(msg.stage, msg.pct);
      else if (msg.type === "done") done(() => resolve(msg.result));
      else done(() => reject(new Error(msg.message)));
    };
    worker.onerror = (e) => done(() => reject(e.error ?? new Error(e.message)));

    worker.postMessage({ front, back });
  });
}
