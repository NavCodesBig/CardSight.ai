"use client";

import { useCallback, useRef, useState } from "react";

/** Drag-drop / file / camera capture zone with live preview. */
export function ImageCapture({
  label,
  file,
  onSelect,
}: {
  label: string;
  file: File | null;
  onSelect: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handle = useCallback(
    (f: File | undefined) => {
      if (!f || !f.type.startsWith("image/")) return;
      onSelect(f);
      const url = URL.createObjectURL(f);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    },
    [onSelect]
  );

  return (
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
      className={`glass relative aspect-[63.5/88.9] w-full max-w-xs overflow-hidden rounded-3xl transition-all ${
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
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={label} className="h-full w-full object-cover" />
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
      {!preview && (
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
  );
}
