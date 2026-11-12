import type { NextRequest } from "next/server";

/** Same-origin CSRF guard (VibeSec): Origin is compared to Host; a missing Origin is allowed since no credentials are in play. */
export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  const host = req.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Body for a refused cross-origin call; deliberately reveals nothing else. */
export const CROSS_ORIGIN_REFUSED = { error: "Cross-origin request refused" } as const;
