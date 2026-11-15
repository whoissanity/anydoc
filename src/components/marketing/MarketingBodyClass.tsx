"use client";

import { useEffect } from "react";

/**
 * The global stylesheet gives the editor a fixed, non-scrolling body. Marketing
 * pages need normal document scrolling, so they opt in with this class instead
 * of changing the editor's global layout.
 */
export function MarketingBodyClass() {
  useEffect(() => {
    document.body.classList.add("mkt-body");
    return () => document.body.classList.remove("mkt-body");
  }, []);

  return null;
}
