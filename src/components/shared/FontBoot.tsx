"use client";

import { useEffect } from "react";
import { ensureScreenFonts } from "@/lib/fonts/register-css";

/**
 * Registers vendored commercial-name aliases and any user-added fonts for
 * on-screen rendering. Runs once per editor mount; never hits the network.
 */
export function FontBoot() {
  useEffect(() => {
    void ensureScreenFonts();
  }, []);
  return null;
}
