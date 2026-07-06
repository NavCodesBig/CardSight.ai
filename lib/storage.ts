/**
 * Scan history persistence.
 *
 * localStorage-backed for the current client-only build. The interface is
 * async so a database-backed implementation (API + Postgres) can replace it
 * without changing callers — the seam for user accounts and collections.
 */

import type { ScanResult } from "./analyze";

const INDEX_KEY = "cardsight.scans.index";
const SCAN_PREFIX = "cardsight.scan.";
const MAX_SCANS = 24; // rectified images are heavy; keep localStorage sane

export interface ScanSummary {
  id: string;
  createdAt: string;
  overall: number;
  label: string;
  favorite: boolean;
  thumbDataUrl: string;
  cardEra: string | null;
  holoType: string;
}

function readIndex(): ScanSummary[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeIndex(index: ScanSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export async function saveScan(scan: ScanResult, label: string): Promise<void> {
  const thumb = await makeThumb(scan.front.rectifiedDataUrl);
  const summary: ScanSummary = {
    id: scan.id,
    createdAt: scan.createdAt,
    overall: scan.grade.overall,
    label,
    favorite: scan.favorite,
    thumbDataUrl: thumb,
    cardEra: scan.cardInfo.eraGuess,
    holoType: scan.cardInfo.holoType,
  };

  let index = [summary, ...readIndex().filter((s) => s.id !== scan.id)];
  // Evict oldest non-favorites past the cap.
  while (index.length > MAX_SCANS) {
    const evictIdx = index.map((s) => s.favorite).lastIndexOf(false);
    const victim = index[evictIdx === -1 ? index.length - 1 : evictIdx];
    localStorage.removeItem(SCAN_PREFIX + victim.id);
    index = index.filter((s) => s.id !== victim.id);
  }

  try {
    localStorage.setItem(SCAN_PREFIX + scan.id, JSON.stringify(scan));
  } catch {
    // Quota exceeded — drop oldest full scans and retry once.
    for (const s of [...index].reverse().slice(0, 5)) {
      if (s.id !== scan.id) localStorage.removeItem(SCAN_PREFIX + s.id);
    }
    localStorage.setItem(SCAN_PREFIX + scan.id, JSON.stringify(scan));
  }
  writeIndex(index);
}

export async function getScan(id: string): Promise<ScanResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SCAN_PREFIX + id);
    return raw ? (JSON.parse(raw) as ScanResult) : null;
  } catch {
    return null;
  }
}

export async function listScans(): Promise<ScanSummary[]> {
  return readIndex();
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const index = readIndex();
  const entry = index.find((s) => s.id === id);
  if (!entry) return false;
  entry.favorite = !entry.favorite;
  writeIndex(index);
  const raw = localStorage.getItem(SCAN_PREFIX + id);
  if (raw) {
    const scan = JSON.parse(raw) as ScanResult;
    scan.favorite = entry.favorite;
    localStorage.setItem(SCAN_PREFIX + id, JSON.stringify(scan));
  }
  return entry.favorite;
}

export async function deleteScan(id: string): Promise<void> {
  localStorage.removeItem(SCAN_PREFIX + id);
  writeIndex(readIndex().filter((s) => s.id !== id));
}

async function makeThumb(dataUrl: string, height = 180): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const scale = height / img.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}
