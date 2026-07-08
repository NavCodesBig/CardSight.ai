"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { CameraCapture } from "./CameraCapture";
import { CornerAdjust } from "./CornerAdjust";
import type { Quad } from "@/lib/vision/types";

/* Static capability check, hydration-safe: server snapshot says no camera,
 * the client snapshot flips it on after hydration. */
const noopSubscribe = () => () => {};
const hasCameraSnapshot = () => !!navigator.mediaDevices?.getUserMedia;
const noCameraSnapshot = () => false;

type Selection = { file: File; url: string; quad?: Quad };

/** Drag-drop / file / live-camera capture zone with corner-adjust + preview. */
export function ImageCapture({
  label,
  file,
  onSelect,
}: {
  label: string;
  file: File | null;
  onSelect: (f: File, quad?: Quad) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [committed, setCommitted] = useState<Selection | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [adjust, setAdjust] = useState<(Selection & { fresh: boolean }) | null>(null);
  const hasCamera = useSyncExternalStore(
    noopSubscribe,
    hasCameraSnapshot,
    noCameraSnapshot
  );

  const commit = useCallback(
    (sel: Selection) => {
      onSelect(sel.file, sel.quad);
      setCommitted((prev) => {
        if (prev && prev.url !== sel.url) URL.revokeObjectURL(prev.url);
        return sel;
      });
    },
    [onSelect]
  );

  // A capture commits immediately when auto-detection is confident; otherwise
  // it opens the corner-adjust step first.
  const handle = useCallback(
    (f: File | undefined, quad?: Quad, confident?: boolean) => {
      if (!f || !f.type.startsWith("image/")) return;
      const url = URL.createObjectURL(f);
      if (confident && quad) commit({ file: f, url, quad });
      else setAdjust({ file: f, url, quad, fresh: true });
    },
    [commit]
  );

  const confirmAdjust = useCallback(
    (finalQuad: Quad) => {
      if (!adjust) return;
      commit({ file: adjust.file, url: adjust.url, quad: finalQuad });
      setAdjust(null);
    },
    [adjust, commit]
  );

  const cancelAdjust = useCallback(() => {
    if (adjust?.fresh) URL.revokeObjectURL(adjust.url);
    setAdjust(null);
  }, [adjust]);

  return (
    <div className="relative w-full max-w-xs">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={`glass relative aspect-[63.5/88.9] w-full overflow-hidden rounded-3xl transition-all ${
          dragOver
            ? "scale-[1.02] border-[var(--accent)] shadow-[0_0_0_2px_var(--accent)]"
            : "hover:scale-[1.01]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        {committed ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={committed.url} alt={label} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-center text-xs font-medium text-white">
              {file?.name} — tap to replace
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center p-6">
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-2xl shadow-lg">
                📷
              </div>
              <div className="mt-4 font-semibold">{label}</div>
              <p className="mt-1 text-xs text-muted">
                Tap to shoot or browse,
                <br />
                or drop an image here
              </p>
            </div>
          </div>
        )}
        {/* Corner guides, scanner-app style */}
        {!committed && (
          <div aria-hidden className="pointer-events-none absolute inset-4 opacity-50">
            {["top-0 left-0 border-t-2 border-l-2", "top-0 right-0 border-t-2 border-r-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map(
              (pos) => (
                <span
                  key={pos}
                  className={`absolute h-6 w-6 rounded-sm border-[var(--accent)] ${pos}`}
                />
              )
            )}
          </div>
        )}
      </button>

      {committed && (
        <button
          type="button"
          onClick={() => setAdjust({ ...committed, fresh: false })}
          aria-label={`Adjust corners for ${label}`}
          className="absolute -bottom-3 -left-3 flex items-center gap-1.5 rounded-full glass-strong px-3.5 py-2 text-xs font-semibold shadow-xl transition-transform hover:scale-105"
        >
          ✥ Adjust
        </button>
      )}

      {hasCamera && (
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          aria-label={`Open live camera for ${label}`}
          className="absolute -bottom-3 -right-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-xs font-semibold text-white shadow-xl transition-transform hover:scale-105"
        >
          🎥 Live
        </button>
      )}

      {cameraOpen && (
        <CameraCapture
          label={label}
          onCapture={handle}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {adjust && (
        <CornerAdjust
          imageUrl={adjust.url}
          initialQuad={adjust.quad}
          onConfirm={confirmAdjust}
          onCancel={cancelAdjust}
        />
      )}
    </div>
  );
}
