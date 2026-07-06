import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CardSight AI — Trading Card Pre-Grading",
    short_name: "CardSight",
    description:
      "AI-powered trading card evaluation with millimeter-precision measurement and PSA/BGS/CGC grade estimates.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07080d",
    theme_color: "#07080d",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
