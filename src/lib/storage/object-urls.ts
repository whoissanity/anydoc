"use client";

/**
 * Tracks object URLs created for in-memory blobs so they can be revoked on demand.
 * Blob URLs pin their blob in memory until revoked; the local draft's "delete now"
 * must release any preview URL that is still alive.
 */

const tracked = new Set<string>();

/** Creates an object URL and keeps it alive until `revokeTrackedObjectUrl` or `revokeAllTrackedObjectUrls`. */
export function createTrackedObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  tracked.add(url);
  return url;
}

/** Revokes one tracked URL. Safe to call twice; a download already started keeps its bytes. */
export function revokeTrackedObjectUrl(url: string): void {
  if (!tracked.delete(url)) return;
  URL.revokeObjectURL(url);
}

/** Revokes every tracked URL (draft deletion, document close, teardown). */
export function revokeAllTrackedObjectUrls(): void {
  for (const url of tracked) URL.revokeObjectURL(url);
  tracked.clear();
}

/** Test helper: how many tracked URLs are still alive. */
export function trackedObjectUrlCount(): number {
  return tracked.size;
}