"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "cardsight.theme";
type Theme = "dark" | "light";

/* The <html> class is the source of truth (set pre-hydration by the inline
 * script in app/layout.tsx); this store subscribes components to it. */
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "dark";
}

/** Theme state synced to the <html> class and localStorage. Dark is default. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(KEY, next);
    listeners.forEach((cb) => cb());
  }, []);

  return { theme, toggle };
}
