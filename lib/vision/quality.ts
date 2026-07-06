/**
 * Image quality gate — runs before the expensive analysis so the user gets
 * actionable feedback ("too blurry", "too much glare") instead of a garbage
 * grade from a garbage photo.
 */

import { laplacian, mean, toGray, variance } from "./imageOps";
import type { ImageQualityReport } from "./types";

const SHARPNESS_MIN = 45; // variance of Laplacian below this reads as blur
const GLARE_MAX = 0.06; // >6% blown highlights is a glare problem
const BRIGHTNESS_MIN = 55;
const BRIGHTNESS_MAX = 215;
const COVERAGE_MIN = 0.25;

export function assessQuality(
  img: ImageData,
  cardCoverage: number
): ImageQualityReport {
  const gray = toGray(img);
  const lap = laplacian(gray);
  const sharpness = variance(lap.data);
  const brightness = mean(gray.data);

  // Glare: fraction of pixels where all channels are near-max.
  let blown = 0;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) blown++;
  }
  const glareRatio = blown / (d.length / 4);

  const blurry = sharpness < SHARPNESS_MIN;
  const tooMuchGlare = glareRatio > GLARE_MAX;
  const tooDark = brightness < BRIGHTNESS_MIN;
  const tooBright = brightness > BRIGHTNESS_MAX;
  const tooFar = cardCoverage < COVERAGE_MIN;

  const warnings: string[] = [];
  if (blurry) warnings.push("Image too blurry — hold the camera steady and refocus.");
  if (tooMuchGlare) warnings.push("Too much glare — tilt the card away from direct light.");
  if (tooDark) warnings.push("Use better lighting — the image is too dark.");
  if (tooBright) warnings.push("Image overexposed — reduce direct light on the card.");
  if (tooFar) warnings.push("Move closer — the card should fill most of the frame.");

  return {
    sharpness: Math.round(sharpness),
    blurry,
    glareRatio,
    tooMuchGlare,
    brightness: Math.round(brightness),
    tooDark,
    tooBright,
    cardCoverage,
    tooFar,
    warnings,
    usable: !blurry && !tooDark && !tooBright,
  };
}
