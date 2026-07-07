import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { ParticleField } from "@/components/layout/ParticleField";
import { SITE_URL } from "@/lib/siteUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CardSight AI — Trading Card Pre-Grading",
    template: "%s · CardSight AI",
  },
  description:
    "AI-powered trading card evaluation: centering, corners, edges and surface analysis with millimeter-precision measurement and PSA/BGS/CGC grade estimates.",
  applicationName: "CardSight AI",
  keywords: [
    "card grading",
    "pokemon card grading",
    "PSA pre-grade",
    "card centering tool",
    "AI card scanner",
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CardSight",
  },
  openGraph: {
    type: "website",
    siteName: "CardSight AI",
    title: "CardSight AI — Know your card's grade before you submit",
    description:
      "Two photos → millimeter-accurate centering, corner, edge and surface analysis with transparent PSA/BGS/CGC estimates.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "CardSight AI — Trading Card Pre-Grading",
    description:
      "AI pre-grading for Pokémon cards: sub-millimeter centering, damage heatmaps, PSA/BGS/CGC estimates.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07080d" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
  ],
};

const themeInit = `try{var t=localStorage.getItem("cardsight.theme")||"dark";if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="ambient flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <ParticleField />
        <Navbar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-8">
          {children}
        </main>
        <footer className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">
          CardSight AI provides pre-grade estimates from photos. Not affiliated
          with PSA, BGS or CGC — always confirm with professional grading.
        </footer>
      </body>
    </html>
  );
}
