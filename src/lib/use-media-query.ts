"use client";

import { useEffect, useState } from "react";

/** Subscribes to a CSS media query. False during SSR and in test environments without matchMedia. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = () => setMatches(list.matches);
    list.addEventListener?.("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}

/** Phone-width shell: the rail becomes a bottom bar and side panes become drawers. */
export function useIsCompact(): boolean {
  return useMediaQuery("(max-width: 700px)");
}

/** Touch-primary device: enables custom pan/pinch gestures even on a wide tablet. */
export function useIsTouch(): boolean {
  return useMediaQuery("(any-pointer: coarse)");
}