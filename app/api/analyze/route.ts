import { NextResponse } from "next/server";

/**
 * Server-side analysis endpoint.
 *
 * The current release runs the full vision pipeline in the browser (zero
 * upload latency, photos never leave the device). This route is the
 * integration point for the fine-tuned vision model: once trained weights
 * exist (see training/README.md), POST the front/back images here and run
 * inference server-side, returning the same ScanResult shape the client
 * pipeline produces.
 */
export async function POST() {
  return NextResponse.json(
    {
      status: "client-side",
      message:
        "Analysis currently runs on-device. Server-side model inference lands here when trained weights are available.",
      modelVersion: null,
    },
    { status: 501 }
  );
}

export async function GET() {
  return NextResponse.json({
    service: "cardsight-analyze",
    pipeline: [
      "card-detection",
      "perspective-rectification",
      "quality-gate",
      "centering",
      "corners",
      "edges",
      "surface",
      "recognition",
      "grade-estimation",
    ],
    executes: "client",
    version: "0.1.0",
  });
}
