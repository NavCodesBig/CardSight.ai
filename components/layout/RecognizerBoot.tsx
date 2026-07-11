"use client";

import { useEffect } from "react";
import { installRecognizer } from "@/lib/recognition/installRecognizer";

/** Installs the embedding recognizer for the main-thread analysis fallback
 *  (the worker installs its own copy at boot). Renders nothing; the install
 *  is a cheap seam swap — heavy models load only when a scan identifies. */
export function RecognizerBoot() {
  useEffect(() => {
    installRecognizer();
  }, []);
  return null;
}
