/** All Tesseract assets are vendored under `public/vendor/tesseract` so OCR runs same-origin with no network (AGENTS.md rule 4). */
export interface TesseractAssetPaths {
  workerPath: string;
  corePath: string;
  langPath: string;
  gzip: boolean;
}

/** Resolved defensively: a worker scope only has `self`, and touching `window` there throws. */
function currentOrigin(): string {
  if (typeof window !== "undefined" && window.location) return window.location.origin;
  if (typeof self !== "undefined" && "location" in self) {
    return (self as unknown as { location: Location }).location.origin;
  }
  return "";
}

export function tesseractAssetPaths(): TesseractAssetPaths {
  const base = `${currentOrigin()}/vendor/tesseract`;
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    // Language files are gzipped to match Tesseract's `.traineddata.gz` request; `gzip: true` is also the default.
    langPath: `${base}/lang`,
    gzip: true,
  };
}
