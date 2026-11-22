import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  assertPdfBytes,
  detectImageKind,
  looksLikePdf,
  readImageFile,
  readPdfFile,
} from "@/lib/document/validate";

const enc = new TextEncoder();

/** BlobPart needs a concrete ArrayBuffer, not a Uint8Array view of a possibly shared buffer. */
const buf = (bytes: Uint8Array) => bytes.buffer as ArrayBuffer;

function pdfBytes(): Uint8Array {
  return enc.encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

/** A fake file-like object: size is checked before any bytes are read. */
function fakeFile(size: number, name: string): File {
  return { size, name } as unknown as File;
}

describe("looksLikePdf", () => {
  it("accepts a header at the start", () => {
    expect(looksLikePdf(pdfBytes())).toBe(true);
  });

  it("accepts a header anywhere in the first 1024 bytes, as the spec allows", () => {
    const offset = new Uint8Array(1010).fill(0x20);
    const bytes = new Uint8Array(offset.length + 5);
    bytes.set(offset, 0);
    bytes.set(enc.encode("%PDF-"), offset.length);
    expect(looksLikePdf(bytes)).toBe(true);
  });

  it("rejects a header past the first 1024 bytes", () => {
    const bytes = new Uint8Array(1030).fill(0x20);
    bytes.set(enc.encode("%PDF-"), 1024);
    expect(looksLikePdf(bytes)).toBe(false);
  });

  it("rejects empty and truncated input without throwing", () => {
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
    expect(looksLikePdf(new Uint8Array([0x25, 0x50]))).toBe(false);
    expect(looksLikePdf(enc.encode("<html>not a pdf</html>"))).toBe(false);
  });
});

describe("detectImageKind", () => {
  it("identifies PNG and JPEG by signature", () => {
    expect(detectImageKind(pngBytes())).toBe("png");
    expect(detectImageKind(jpegBytes())).toBe("jpeg");
  });

  it("rejects other image formats instead of guessing", () => {
    // GIF89a — a valid image, but not one this app can embed safely.
    expect(detectImageKind(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
    expect(detectImageKind(enc.encode("just text"))).toBeNull();
    expect(detectImageKind(new Uint8Array(0))).toBeNull();
  });

  it("rejects truncated signatures", () => {
    expect(detectImageKind(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(detectImageKind(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("assertPdfBytes", () => {
  it("accepts a well-formed header", () => {
    expect(() => assertPdfBytes(pdfBytes())).not.toThrow();
  });

  it("rejects empty bytes", () => {
    expect(() => assertPdfBytes(new Uint8Array(0))).toThrow(/is empty/);
  });

  it("rejects an oversized payload before inspecting its content", () => {
    const huge = { byteLength: MAX_PDF_BYTES + 1 } as unknown as Uint8Array;
    expect(() => assertPdfBytes(huge)).toThrow(/larger than the 100 MB limit/);
  });

  it("rejects bytes that are not a PDF", () => {
    expect(() => assertPdfBytes(enc.encode("MZ\u0000executable"))).toThrow(/not a PDF/);
  });
});

describe("readPdfFile", () => {
  it("rejects a renamed non-PDF: content decides, not the extension or MIME", async () => {
    const file = new File(["<html>hello</html>"], "invoice.pdf", {
      type: "application/pdf",
    });
    await expect(readPdfFile(file)).rejects.toThrow(/not a PDF/);
  });

  it("accepts PDF content even when the name and MIME claim something else", async () => {
    const file = new File([buf(pdfBytes())], "notes.txt", { type: "text/plain" });
    const bytes = await readPdfFile(file);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("rejects an empty file", async () => {
    await expect(readPdfFile(new File([], "empty.pdf"))).rejects.toThrow(/is empty/);
  });

  it("rejects an oversized file without reading it", async () => {
    await expect(readPdfFile(fakeFile(MAX_PDF_BYTES + 1, "big.pdf"))).rejects.toThrow(
      /larger than the 100 MB limit/
    );
  });
});

describe("readImageFile", () => {
  it("reports the kind the bytes actually are", async () => {
    const png = await readImageFile(
      new File([buf(pngBytes())], "photo.pdf", { type: "application/pdf" })
    );
    expect(png.mime).toBe("image/png");

    const jpeg = await readImageFile(new File([buf(jpegBytes())], "photo", { type: "image/png" }));
    expect(jpeg.mime).toBe("image/jpeg");
  });

  it("rejects a file whose declared MIME is an image but whose bytes are not", async () => {
    const file = new File(["GIF89a...."], "animation.png", { type: "image/png" });
    await expect(readImageFile(file)).rejects.toThrow(/not a PNG or JPEG/);
  });

  it("rejects empty and oversized images", async () => {
    await expect(readImageFile(new File([], "empty.png"))).rejects.toThrow(/empty/);
    await expect(readImageFile(fakeFile(MAX_IMAGE_BYTES + 1, "huge.jpg"))).rejects.toThrow(
      /smaller than 32 MB/
    );
  });
});
