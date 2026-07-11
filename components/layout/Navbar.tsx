"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/hooks/useTheme";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/scan", label: "Scan" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <nav className="glass-strong mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-2xl px-3 py-2.5 sm:px-5 sm:py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight sm:gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-sm font-bold text-white shadow-lg">
            CS
          </span>
          <span className="truncate text-lg max-[380px]:hidden">
            CardSight <span className="text-gradient">AI</span>
          </span>
        </Link>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-11 items-center rounded-xl px-3 text-sm font-medium transition-colors sm:min-h-0 sm:px-3.5 sm:py-2 ${
                l.href === "/" ? "hidden sm:block" : ""
              } ${
                pathname === l.href
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-muted hover:bg-[var(--card-border)] hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="ml-1 grid h-11 w-11 place-items-center rounded-xl border border-[var(--card-border)] text-sm transition-transform hover:scale-105 sm:ml-2 sm:h-9 sm:w-9"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </nav>
    </header>
  );
}
