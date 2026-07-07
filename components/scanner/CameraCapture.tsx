"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectCard } from "@/lib/vision/cardDetector";
import type { Quad } from "@/lib/vision/types";

type DetectState = "searching" | "far" | "close" | "found" | "unavailable";

const DETECT_INTERVAL_MS = 140; // run detection ~7×/sec
const WORK_WIDTH = 380; // downscaled analysis width
const SMOOTH = 0.4; // per-frame lerp toward the newest detection (0..1)
const MIN_CONF = 0.6;
const NEAR_COVERAGE = 0.3; // below → "move closer"
const FAR_COVERAGE = 0.9; // above → "move back"

const STATUS: Record<DetectState, { text: string; tone: "ok" | "warn" | "idle" }> = {
  found: { text: "✓ Card locked — hold steady", tone: "ok" },
  far: { text: "Move closer — fill the frame", tone: "warn" },
  close: { text: "Move back a little", tone: "warn" },
  searching: { text: "Align the card within the frame", tone: "idle" },
  unavailable: { text: "", tone: "idle" },
};

/**
 * Live camera capture modal with real-time card outline detection.
 * A downscaled frame is analyzed several times a second; the detected quad is
 * temporally smoothed and drawn over the video so the outline tracks the card
 * without jitter, and coverage-based hints guide framing before capture.
 */
export function CameraCapture({
  label,
  onCapture,
  onClose,
}: {
  label: string;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detect, setDetect] = useState<DetectState>("searching");
  const [ready, setReady] = useState(false);

  // Start the camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch {
        setError("Camera unavailable — check permissions, or use the photo picker instead.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Detection + smoothed drawing loop
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current!;
    const overlay = overlayRef.current!;
    const work = document.createElement("canvas");
    const wctx = work.getContext("2d", { willReadFrequently: true })!;

    let raf = 0;
    let lastDetect = 0;
    let scale = 1;
    let target: Quad | null = null; // newest detection, in work-canvas space
    let smooth: Quad | null = null; // lerped quad drawn to screen
    let lostFrames = 0;
    let stateRef: DetectState = "searching";

    const setState = (s: DetectState) => {
      if (s !== stateRef) {
        stateRef = s;
        setDetect(s);
      }
    };

    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (video.videoWidth === 0) return;

      // Size the overlay once to the video's pixel dimensions.
      if (overlay.width !== video.videoWidth) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        scale = WORK_WIDTH / video.videoWidth;
        work.width = WORK_WIDTH;
        work.height = Math.round(video.videoHeight * scale);
      }

      if (t - lastDetect > DETECT_INTERVAL_MS) {
        lastDetect = t;
        wctx.drawImage(video, 0, 0, work.width, work.height);
        const det = detectCard(wctx.getImageData(0, 0, work.width, work.height));
        const cov = quadArea(det.quad) / (work.width * work.height);

        if (det.confidence > MIN_CONF && cov > 0.1) {
          target = det.quad;
          lostFrames = 0;
          setState(cov < NEAR_COVERAGE ? "far" : cov > FAR_COVERAGE ? "close" : "found");
        } else if (++lostFrames > 4) {
          target = null;
          setState("searching");
        }
      }

      const octx = overlay.getContext("2d")!;
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (!target) {
        smooth = null;
        return;
      }
      smooth = smooth ? lerpQuad(smooth, target, SMOOTH) : target;
      drawQuad(octx, smooth, 1 / scale, overlay.width, stateRef === "found");
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Grab the exact frame being captured.
    const full = document.createElement("canvas");
    full.width = vw;
    full.height = vh;
    full.getContext("2d")!.drawImage(video, 0, 0);

    // Detect the card on this frame and crop to it (with margin) so the
    // analyzed region matches the outline the user framed, instead of the
    // whole camera frame being re-detected downstream.
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    try {
      const s = WORK_WIDTH / vw;
      const work = document.createElement("canvas");
      work.width = WORK_WIDTH;
      work.height = Math.round(vh * s);
      const wctx = work.getContext("2d", { willReadFrequently: true })!;
      wctx.drawImage(full, 0, 0, work.width, work.height);
      const det = detectCard(wctx.getImageData(0, 0, work.width, work.height));
      if (det.confidence > MIN_CONF) {
        const box = boundingBox(det.quad, 1 / s, vw, vh);
        ({ sx, sy, sw, sh } = box);
      }
    } catch {
      // Fall back to the full frame on any detection failure.
    }

    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d")!.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
    out.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `${label.toLowerCase().replace(/\s+/g, "-")}.jpg`, { type: "image/jpeg" }));
        onClose();
      },
      "image/jpeg",
      0.92
    );
  }, [label, onCapture, onClose]);

  const status = STATUS[detect];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md">
      <div className="glass-strong w-full max-w-lg overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="font-semibold">{label}</span>
          <button
            onClick={onClose}
            aria-label="Close camera"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--card-border)]"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="p-8 text-center text-sm text-muted">{error}</div>
        ) : (
          <>
            <div className="relative bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="max-h-[60vh] w-full object-contain"
              />
              <canvas ref={overlayRef} className="absolute inset-0 h-full w-full object-contain" />
              <div
                className={`absolute inset-x-0 top-3 mx-auto w-fit rounded-full px-4 py-1.5 text-xs font-semibold backdrop-blur ${
                  status.tone === "ok"
                    ? "bg-emerald-500/25 text-emerald-300"
                    : status.tone === "warn"
                      ? "bg-amber-500/25 text-amber-200"
                      : "bg-black/45 text-white/85"
                }`}
              >
                {status.text}
              </div>
            </div>

            <div className="grid place-items-center py-5">
              <button
                onClick={capture}
                disabled={!ready}
                aria-label="Capture photo"
                className={`grid h-16 w-16 place-items-center rounded-full border-4 transition-all disabled:opacity-40 ${
                  detect === "found"
                    ? "border-emerald-400 bg-emerald-400/25"
                    : "border-white/70 bg-white/15"
                }`}
              >
                <span className="h-11 w-11 rounded-full bg-white/90" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Padded, frame-clamped bounding box of a quad, scaled from work space (×inv)
 * into full-frame pixels. Margin leaves the card edges some background so the
 * downstream edge-scan detector can re-lock the same outline.
 */
function boundingBox(
  q: Quad,
  inv: number,
  frameW: number,
  frameH: number
): { sx: number; sy: number; sw: number; sh: number } {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x].map((x) => x * inv);
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y].map((y) => y * inv);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 0.08 * Math.max(maxX - minX, maxY - minY);
  const sx = Math.max(0, Math.floor(minX - pad));
  const sy = Math.max(0, Math.floor(minY - pad));
  const sw = Math.min(frameW - sx, Math.ceil(maxX - minX + 2 * pad));
  const sh = Math.min(frameH - sy, Math.ceil(maxY - minY + 2 * pad));
  return { sx, sy, sw, sh };
}

/** Shoelace area of a quad (in its own coordinate space). */
function quadArea(q: Quad): number {
  const p = [q.tl, q.tr, q.br, q.bl];
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return Math.abs(a) / 2;
}

function lerpQuad(a: Quad, b: Quad, f: number): Quad {
  const mix = (p: { x: number; y: number }, q: { x: number; y: number }) => ({
    x: p.x + (q.x - p.x) * f,
    y: p.y + (q.y - p.y) * f,
  });
  return { tl: mix(a.tl, b.tl), tr: mix(a.tr, b.tr), br: mix(a.br, b.br), bl: mix(a.bl, b.bl) };
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  q: Quad,
  inv: number,
  width: number,
  locked: boolean
): void {
  ctx.strokeStyle = locked ? "#34d399" : "#fbbf24";
  ctx.lineWidth = Math.max(3, width * 0.005);
  ctx.lineJoin = "round";
  ctx.setLineDash(locked ? [] : [18, 10]);
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = locked ? width * 0.012 : 0;
  ctx.beginPath();
  ctx.moveTo(q.tl.x * inv, q.tl.y * inv);
  for (const p of [q.tr, q.br, q.bl, q.tl]) ctx.lineTo(p.x * inv, p.y * inv);
  ctx.stroke();
  ctx.shadowBlur = 0;
}
