"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectCard } from "@/lib/vision/cardDetector";

type DetectState = "searching" | "found" | "unavailable";

/**
 * Live camera capture modal with real-time card outline detection.
 * A downscaled frame is analyzed ~2×/sec; the detected quad is drawn over
 * the video feed so the user knows the card is locked before capturing.
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

  // Detection loop on downscaled frames
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current!;
    const overlay = overlayRef.current!;
    const work = document.createElement("canvas");
    const wctx = work.getContext("2d", { willReadFrequently: true })!;
    let stopped = false;

    const loop = () => {
      if (stopped || video.videoWidth === 0) return;
      const scale = 380 / video.videoWidth;
      work.width = 380;
      work.height = Math.round(video.videoHeight * scale);
      wctx.drawImage(video, 0, 0, work.width, work.height);
      const det = detectCard(wctx.getImageData(0, 0, work.width, work.height));

      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      const octx = overlay.getContext("2d")!;
      octx.clearRect(0, 0, overlay.width, overlay.height);

      if (det.confidence > 0.55) {
        setDetect("found");
        const inv = 1 / scale;
        octx.strokeStyle = "#34d399";
        octx.lineWidth = Math.max(3, overlay.width * 0.005);
        octx.setLineDash([18, 10]);
        octx.beginPath();
        const q = det.quad;
        octx.moveTo(q.tl.x * inv, q.tl.y * inv);
        for (const p of [q.tr, q.br, q.bl, q.tl]) octx.lineTo(p.x * inv, p.y * inv);
        octx.stroke();
      } else {
        setDetect("searching");
      }
    };

    const id = setInterval(loop, 450);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [ready]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `${label.toLowerCase().replace(/\s+/g, "-")}.jpg`, { type: "image/jpeg" }));
        onClose();
      },
      "image/jpeg",
      0.92
    );
  }, [label, onCapture, onClose]);

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
                  detect === "found"
                    ? "bg-emerald-500/25 text-emerald-300"
                    : "bg-black/45 text-white/85"
                }`}
              >
                {detect === "found"
                  ? "✓ Card detected — hold steady"
                  : "Align the card within the frame"}
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
