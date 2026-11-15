// Dev-only Vitest setup. Registers jest-dom matchers (toBeInTheDocument, etc.)
// for component interaction tests. NOT mirrored to anydoc/.
import "@testing-library/jest-dom/vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The app loads vendored fonts and the sRGB ICC profile from /vendor/... at
// runtime. jsdom has no document base URL, so resolve those same-origin paths
// from public/ for tests without adding a production filesystem dependency.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.startsWith("/vendor/")) {
    const path = join(process.cwd(), "public", url);
    const bytes = await readFile(path);
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  }
  return realFetch(input, init);
};