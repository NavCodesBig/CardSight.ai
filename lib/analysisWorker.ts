/**
 * Web Worker entry — runs the full analysis pipeline off the main thread so
 * the processing UI stays at 60 fps even on mid-range phones.
 * Spawned by lib/runAnalysis.ts; do not import from React code.
 */

import { analyzeCard, type ProgressStage } from "./analyze";

export interface WorkerRequest {
  front: Blob;
  back: Blob;
}

export type WorkerResponse =
  | { type: "progress"; stage: ProgressStage; pct: number }
  | { type: "done"; result: Awaited<ReturnType<typeof analyzeCard>> }
  | { type: "error"; message: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const post = (msg: WorkerResponse) => self.postMessage(msg);
  try {
    const result = await analyzeCard(e.data.front, e.data.back, (stage, pct) =>
      post({ type: "progress", stage, pct })
    );
    post({ type: "done", result });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
