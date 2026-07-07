/**
 * Canonical site URL for metadata (metadataBase, OG images, sitemap, robots).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL — explicit override (custom domain).
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production domain,
 *      injected automatically on every deploy (no protocol, so we add https).
 *   3. localhost — local dev fallback.
 *
 * This means a Vercel deploy gets correct absolute URLs with zero config.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
