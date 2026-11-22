// DEV-ONLY E2E: real dual-engine OCR runs with a strict same-origin request audit.
// Not mirrored to anydoc/ (deployment tree).
import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function textPdf(pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText("Hello OCR 123", { x: 72, y: 700, size: 32, font, color: rgb(0, 0, 0) });
    page.drawText("Second line for reading", { x: 72, y: 650, size: 20, font, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

async function openAndOcr(page: Page, pages = 1): Promise<string[]> {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://localhost:3000") && !url.startsWith("data:") && !url.startsWith("blob:")) {
      external.push(url);
    }
  });

  await page.goto("/editor");
  await page.locator("#anydoc-file-input").setInputFiles({
    name: "ocr-sample.pdf",
    mimeType: "application/pdf",
    buffer: await textPdf(pages),
  });
  await expect(page.locator("[data-page='1'] canvas")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByTitle("Make Searchable (OCR)").click();

  const modal = page.locator("body");
  await expect(modal).toContainText(new RegExp(`1/${pages}:`), { timeout: 30_000 });

  // The Paddle fallback message also contains "failed"; completion is the modal's
  // dedicated success line, so wait for that rather than the word alone.
  await expect
    .poll(async () => (await modal.textContent()) ?? "", {
      timeout: 170_000,
      intervals: [1000],
    })
    .toContain("OCR complete. The searchable copy is ready.");

  // A selectable layer exists after the reloaded searchable copy.
  await expect
    .poll(async () => page.locator("[data-page='1'] .pdf-text-layer span").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      (await page.locator("[data-page='1'] .pdf-text-layer span").allTextContents()).join(" ")
    )
    .toMatch(/hello/i);
  const positioned = await page
    .locator("[data-page='1'] .pdf-text-layer span")
    .evaluateAll((spans) =>
      spans.every((span) => {
        const el = span as HTMLElement;
        return el.style.left !== "" && el.style.top !== "";
      })
    );
  expect(positioned).toBe(true);

  expect(external).toEqual([]);
  return external;
}

test("OCR runs offline with Paddle first and produces a searchable text layer", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openAndOcr(page);
  await expect(
    page.locator("section").filter({ hasText: "1/1:" }).getByText("PaddleOCR", { exact: true })
  ).toBeVisible();
});

test("a blocked Paddle runtime falls back to Tesseract and still completes", async ({ page }) => {
  test.setTimeout(240_000);
  // Force initialization to fail exactly as a broken/missing ONNX deployment would.
  await page.route("**/vendor/paddleocr/**", (route) => route.abort());
  await openAndOcr(page, 3);

  await expect(
    page.locator("section").filter({ hasText: "3/3:" }).getByText("Tesseract", { exact: true })
  ).toBeVisible();
});

test("Cancel mid-run stops the queue and leaves the dialog restartable", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/editor");
  await page.locator("#anydoc-file-input").setInputFiles({
    name: "ocr-cancel.pdf",
    mimeType: "application/pdf",
    buffer: await textPdf(8),
  });
  await expect(page.locator("[data-page='1'] canvas")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByTitle("Make Searchable (OCR)").click();
  await expect(page.locator("body")).toContainText(/1\/8:/, { timeout: 30_000 });

  await page.getByRole("button", { name: "Cancel OCR" }).click();
  await expect(page.getByText("On-device OCR", { exact: true })).toHaveCount(0);

  // Restarting must begin a fresh run (this toolbar button starts OCR directly)
  // rather than staying latched to the cancelled job.
  await page.getByTitle("Make Searchable (OCR)").click();
  await expect(page.getByRole("button", { name: "Cancel OCR" })).toBeVisible({
    timeout: 15_000,
  });
});
