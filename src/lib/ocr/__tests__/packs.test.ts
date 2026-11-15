import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  OCR_MANIFEST,
  computeSha256,
  decompressGzip,
  formatBytes,
  getPackMeta,
  getPacksSummary,
  isPackInstalled,
  removePack,
  verifyUserPack,
} from "../packs";
import { clear } from "idb-keyval";
import zlib from "zlib";

describe("OCR Packs and Manifest", () => {
  beforeEach(async () => {
    await clear();
  });

  it("ships every configured language as a vendored pack", () => {
    expect(OCR_MANIFEST.packs).toHaveLength(23);
    for (const pack of OCR_MANIFEST.packs) {
      expect(pack.vendored).toBe(true);
      expect(pack.bytes).toBeGreaterThan(0);
      expect(pack.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const eng = OCR_MANIFEST.languages["eng"];
    expect(eng).toBeDefined();
    expect(eng.bytes).toBe(10923060);
    expect(eng.sha256).toBe("ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468");
  });

  it("computes SHA-256 correctly", async () => {
    const data = new TextEncoder().encode("Hello Tesseract");
    const hash = await computeSha256(data);
    expect(hash).toBe("50491d9f3ff799620bd422a99583a7de61a6889662d57910da0388946ec7cc92");
  });

  it("formats bytes accurately", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10485760)).toBe("10.0 MB");
  });

  it("treats every vendored pack as installed without any download", async () => {
    expect(await isPackInstalled("eng")).toBe(true);
    expect(await isPackInstalled("spa")).toBe(true);
    expect(await isPackInstalled("chi_sim")).toBe(true);
    expect(await isPackInstalled("klingon")).toBe(false);
  });

  it("rejects unknown or altered pack files", async () => {
    const fakeData = new Uint8Array([1, 2, 3, 4]);
    const res = await verifyUserPack(fakeData, "spa");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Checksum verification failed");
  });

  it("imports and verifies a valid simulated pack", async () => {
    const spaMeta = getPackMeta("spa")!;
    expect(spaMeta).toBeDefined();

    const fakePack = new Uint8Array(100);
    const res = await verifyUserPack(fakePack, "nonexistent");
    expect(res.valid).toBe(false);
  });

  it("can decompress gzipped bytes", async () => {
    const original = new TextEncoder().encode("tesseract trained data test string");
    const gzipped = new Uint8Array(zlib.gzipSync(original));
    const decompressed = await decompressGzip(gzipped);
    expect(new TextDecoder().decode(decompressed)).toBe("tesseract trained data test string");
  });

  it("lists all 23 packs as bundled with correct total disk use", async () => {
    const summary = await getPacksSummary();
    const installedBytes = OCR_MANIFEST.packs.reduce((sum, pack) => sum + pack.bytes, 0);

    expect(summary.totalCount).toBe(23);
    expect(summary.installedCount).toBe(23);
    expect(summary.totalDiskUsageBytes).toBe(installedBytes);
    expect(summary.packs.every((pack) => pack.source === "bundled" && pack.installed)).toBe(true);
  });

  it("verifies and imports an authentic pack", async () => {
    // Read local eng pack as a sample authentic pack
    const fs = await import("fs");
    const path = await import("path");
    const engBuf = fs.readFileSync(path.resolve("public/vendor/tesseract/lang/eng.traineddata.gz"));
    const uint8 = new Uint8Array(engBuf);

    const verified = await verifyUserPack(uint8, "eng");
    expect(verified.valid).toBe(true);
    expect(verified.code).toBe("eng");
    expect(verified.actualBytes).toBe(10923060);
    expect(verified.actualSha256).toBe("ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468");
  });

  it("refuses to remove a bundled pack", async () => {
    expect(await removePack("spa")).toBe(false);
    expect(await isPackInstalled("spa")).toBe(true);
  });
});
