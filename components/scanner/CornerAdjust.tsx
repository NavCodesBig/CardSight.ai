"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectCard,
  rectifyCard,
  RECTIFIED_WIDTH,
  RECTIFIED_HEIGHT,
} from "@/lib/vision/cardDetector";
import type { Point, Quad } from "@/lib/vision/types";

/**
 * Manual corner-adjust step. Shows the captured photo with four draggable
 * handles seeded from auto-detection (or an inset default), plus a live
 * rectified preview. Whatever the user confirms becomes the quad the analysis
 * pipeline rectifies with — guaranteeing the crop matches the real card edges
 * regardless of how well auto-detection did on the background.
 */
export function CornerAdjust({
  imageUrl,
  initialQuad,
  onConfirm,
  onCancel,
}: {
  imageUrl: string;
  initialQuad?: Quad | null;
  onConfirm: (quad: Quad) => void;
  onCancel: () => void;
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [pts, setPts] = useState<Point[] | null>(null); // [tl, tr, br, bl]
  const imgDataRef = useRef<ImageData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  // Load the image, capture its pixels for the preview, and seed the corners.
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      imgDataRef.current = ctx.getImageData(0, 0, w, h);

      const quad = initialQuad ?? detectSeed(img, w, h) ?? insetQuad(w, h);
      setNat({ w, h });
      setPts([quad.tl, quad.tr, quad.br, quad.bl]);
    };
    img.src = imageUrl;
    return () => {
      alive = false;
    };
  }, [imageUrl, initialQuad]);

  const drawPreview = useCallback(() => {
    const data = imgDataRef.current;
    const canvas = previewRef.current;
    if (!data || !canvas || !pts) return;
    const quad: Quad = { tl: pts[0], tr: pts[1], br: pts[2], bl: pts[3] };
    const rect = rectifyCard(data, quad);
    const tmp = document.createElement("canvas");
    tmp.width = RECTIFIED_WIDTH;
    tmp.height = RECTIFIED_HEIGHT;
    tmp.getContext("2d")!.putImageData(rect, 0, 0);
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  }, [pts]);

  useEffect(() => {
    if (!pts) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawPreview);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pts, drawPreview]);

  const toSvg = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM()!;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const loc = p.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  };

  const onMove = (e: React.PointerEvent) => {
    const i = dragRef.current;
    if (i == null || !nat || !pts) return;
    const { x, y } = toSvg(e.clientX, e.clientY);
    const next = pts.slice();
    next[i] = {
      x: Math.max(0, Math.min(nat.w, x)),
      y: Math.max(0, Math.min(nat.h, y)),
    };
    setPts(next);
  };

  if (!nat || !pts) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-md">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  const handleR = Math.max(nat.w, nat.h) * 0.022;
  const stroke = Math.max(nat.w, nat.h) * 0.005;
  const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md">
      <div className="glass-strong max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-3xl">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="font-semibold">Adjust the corners</span>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--card-border)]"
          >
            ✕
          </button>
        </div>

        <p className="px-5 pb-2 text-xs text-muted">
          Drag each dot onto the card&apos;s real corners. The preview shows the crop
          that will be graded.
        </p>

        <div className="flex flex-col gap-4 px-5 sm:flex-row">
          <div className="relative flex-1 touch-none select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Captured card" className="w-full rounded-xl" />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${nat.w} ${nat.h}`}
              className="absolute inset-0 h-full w-full"
              onPointerMove={onMove}
              onPointerUp={() => (dragRef.current = null)}
              onPointerLeave={() => (dragRef.current = null)}
            >
              <polygon
                points={poly}
                fill="rgba(52,211,153,0.12)"
                stroke="#34d399"
                strokeWidth={stroke}
                strokeLinejoin="round"
              />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={handleR}
                  fill="#34d399"
                  stroke="#0b1220"
                  strokeWidth={stroke}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture(e.pointerId);
                    dragRef.current = i;
                  }}
                />
              ))}
            </svg>
          </div>

          {/* Preview sits beside the hint on phones, in its own column on larger screens */}
          <div className="flex shrink-0 items-center gap-3 sm:block">
            <canvas
              ref={previewRef}
              width={120}
              height={168}
              className="h-24 w-auto rounded-lg bg-black/30 shadow-lg sm:order-none sm:h-auto sm:w-[120px]"
            />
            <div className="text-xs text-muted sm:mt-1 sm:text-center">Cropped preview</div>
          </div>
        </div>

        <div className="flex gap-2 p-5 sm:justify-end">
          <button
            onClick={onCancel}
            className="glass min-h-12 flex-1 rounded-xl px-5 text-sm font-semibold sm:flex-none"
          >
            Retake
          </button>
          <button
            onClick={() => onConfirm({ tl: pts[0], tr: pts[1], br: pts[2], bl: pts[3] })}
            className="min-h-12 flex-1 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-5 text-sm font-semibold text-white sm:flex-none"
          >
            Analyze this crop
          </button>
        </div>
      </div>
    </div>
  );
}

/** Seed corners from auto-detection on a downscaled copy; null if unreliable. */
function detectSeed(img: HTMLImageElement, w: number, h: number): Quad | null {
  const scale = 380 / w;
  const c = document.createElement("canvas");
  c.width = 380;
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const det = detectCard(ctx.getImageData(0, 0, c.width, c.height));
  if (det.confidence < 0.5) return null;
  const inv = 1 / scale;
  const m = (p: Point): Point => ({ x: p.x * inv, y: p.y * inv });
  return { tl: m(det.quad.tl), tr: m(det.quad.tr), br: m(det.quad.br), bl: m(det.quad.bl) };
}

/** Default rectangle when detection can't seed the corners. Nearly full-frame:
 *  detection most often fails on full-bleed uploads (digital scans, screenshots)
 *  where the card IS the frame, and the pipeline's edge-snap can pull a
 *  near-frame quad the last few pixels; a deep inset just cropped into the art. */
function insetQuad(w: number, h: number): Quad {
  const mx = w * 0.02;
  const my = h * 0.02;
  return {
    tl: { x: mx, y: my },
    tr: { x: w - mx, y: my },
    br: { x: w - mx, y: h - my },
    bl: { x: mx, y: h - my },
  };
}
