/**
 * Shareable report-card renderer: draws a scan's key results onto a
 * 1080×1400 canvas and returns a PNG blob for download / Web Share.
 */

import type { ScanResult } from "./analyze";
import { gradeLabel } from "./grading/scale";

const W = 1080;
const H = 1400;

export async function renderReportCard(scan: ScanResult): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#07080d";
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W * 0.15, -100, 620, "rgba(109,92,255,0.4)");
  glow(ctx, W * 1.02, H * 0.35, 520, "rgba(0,200,255,0.25)");

  // Header
  ctx.fillStyle = "#fff";
  roundRect(ctx, 64, 64, 56, 56, 16);
  const grad = ctx.createLinearGradient(64, 64, 120, 120);
  grad.addColorStop(0, "#6d5cff");
  grad.addColorStop(1, "#00c8ff");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CS", 92, 94);

  ctx.textAlign = "left";
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText("CardSight AI", 140, 94);
  ctx.fillStyle = "#9aa1b5";
  ctx.font = "26px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(new Date(scan.createdAt).toLocaleDateString(), W - 64, 94);
  ctx.textAlign = "left";

  // Card image
  const img = await loadImage(scan.front.rectifiedDataUrl);
  const cardW = 400;
  const cardH = Math.round((cardW * img.height) / img.width);
  ctx.save();
  roundRect(ctx, 64, 170, cardW, cardH, 24);
  ctx.clip();
  ctx.drawImage(img, 64, 170, cardW, cardH);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  roundRect(ctx, 64, 170, cardW, cardH, 24);
  ctx.stroke();

  // Overall grade ring
  const cx = 780, cy = 330, r = 130;
  const overall = scan.grade.overall;
  const ringColor =
    overall >= 9 ? "#34d399" : overall >= 7 ? "#a3e635" : overall >= 5 ? "#fbbf24" : "#f87171";
  ctx.lineWidth = 22;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ringColor;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (overall / 10) * Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 96px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(overall.toFixed(1), cx, cy - 8);
  ctx.fillStyle = "#9aa1b5";
  ctx.font = "26px system-ui, sans-serif";
  ctx.fillText("AI pre-grade", cx, cy + 56);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText(gradeLabel(overall).label, cx, cy + r + 76);

  // Subgrades
  const subs = [
    ["Centering", scan.grade.subgrades.centering],
    ["Corners", scan.grade.subgrades.corners],
    ["Edges", scan.grade.subgrades.edges],
    ["Surface", scan.grade.subgrades.surface],
  ] as const;
  const tileY = 170 + cardH + 56;
  const tileW = (W - 128 - 3 * 24) / 4;
  subs.forEach(([name, value], i) => {
    const x = 64 + i * (tileW + 24);
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    roundRect(ctx, x, tileY, tileW, 130, 20);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(value.toFixed(1), x + tileW / 2, tileY + 56);
    ctx.fillStyle = "#9aa1b5";
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(name, x + tileW / 2, tileY + 100);
  });

  // Company estimates
  const estY = tileY + 190;
  ctx.fillStyle = "#9aa1b5";
  ctx.font = "26px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("LIKELY PROFESSIONAL GRADES", 64, estY);
  scan.companyEstimates.forEach((e, i) => {
    const x = 64 + i * ((W - 128 - 2 * 24) / 3 + 24);
    const w = (W - 128 - 2 * 24) / 3;
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    roundRect(ctx, x, estY + 24, w, 120, 20);
    ctx.fill();
    ctx.fillStyle = "#9aa1b5";
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(e.company, x + 28, estY + 68);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 52px system-ui, sans-serif";
    ctx.fillText(String(e.mostLikely), x + 28, estY + 118);
    ctx.fillStyle = "#38d6ff";
    ctx.font = "26px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      `${Math.round(e.probabilities[0].probability * 100)}%`,
      x + w - 28,
      estY + 112
    );
    ctx.textAlign = "left";
  });

  // Centering line
  const c = scan.front.centering;
  ctx.fillStyle = "#9aa1b5";
  ctx.font = "26px system-ui, sans-serif";
  ctx.fillText(
    `Centering  L ${c.leftPct}% / R ${c.rightPct}%  ·  T ${c.topPct}% / B ${c.bottomPct}%  ·  confidence ${Math.round(scan.grade.confidence * 100)}%`,
    64,
    estY + 210
  );

  // Footer
  ctx.fillStyle = "rgba(154,161,181,0.75)";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText(
    "AI pre-grade estimate from photos — not an official PSA/BGS/CGC grade.",
    64,
    H - 56
  );

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png"
    )
  );
}

export async function shareOrDownloadReport(scan: ScanResult): Promise<void> {
  const blob = await renderReportCard(scan);
  const file = new File([blob], `cardsight-${scan.grade.overall}.png`, {
    type: "image/png",
  });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "CardSight AI pre-grade",
        text: `AI pre-grade: ${scan.grade.overall} (${gradeLabel(scan.grade.overall).label})`,
      });
      return;
    } catch {
      // user cancelled or share failed → fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
