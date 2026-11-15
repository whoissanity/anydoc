// DEV-ONLY E2E: paragraph grouping in the PDF text layer. Not mirrored to anydoc/.
import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function paragraphPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "First line of the paragraph",
    "second line continues here",
    "third line closes it.",
  ];
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 72,
      y: 700 - index * 14,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  });
  return Buffer.from(await doc.save());
}

test("clicking one line opens the whole paragraph with its source leading", async ({ page }) => {
  await page.goto("/editor");
  await page.locator("#anydoc-file-input").setInputFiles({
    name: "paragraph.pdf",
    mimeType: "application/pdf",
    buffer: await paragraphPdf(),
  });
  await expect(page.locator("[data-page='1'] canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByTitle("Edit existing text (click a word)").click();

  const layer = page.locator("[data-page='1'] .pdf-text-layer");
  await expect(layer.locator("span")).toHaveCount(3);
  await layer.locator("span").first().click({ force: true });

  const textarea = page.locator("[data-page='1'] textarea");
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue(
    "First line of the paragraph\nsecond line continues here\nthird line closes it."
  );

  // 14pt baselines over 12pt type must survive as ~1.167, not the old 1.25 default.
  const ratio = await textarea.evaluate((el) => {
    const style = getComputedStyle(el);
    return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
  });
  expect(ratio).toBeCloseTo(14 / 12, 2);

  // Every span in the block is hidden behind the editor, not just the clicked run.
  const opacities = await layer
    .locator("span")
    .evaluateAll((spans) => spans.map((span) => (span as HTMLElement).style.opacity));
  expect(opacities).toEqual(["0", "0", "0"]);

  await textarea.press("Escape");
  await expect(page.locator("[data-page='1'] textarea")).toHaveCount(0);
});

test("committing a paragraph bakes its three lines at three distinct baselines", async ({
  page,
}) => {
  await page.goto("/editor");
  await page.locator("#anydoc-file-input").setInputFiles({
    name: "paragraph.pdf",
    mimeType: "application/pdf",
    buffer: await paragraphPdf(),
  });
  await expect(page.locator("[data-page='1'] canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByTitle("Edit existing text (click a word)").click();
  const layer = page.locator("[data-page='1'] .pdf-text-layer");
  await layer.locator("span").first().click({ force: true });
  const textarea = page.locator("[data-page='1'] textarea");
  await expect(textarea).toBeVisible();
  await textarea.press("Enter");
  await expect(textarea).toHaveCount(0, { timeout: 20_000 });

  // The original runs remain in the content stream (the edit is painted over them), so
  // the reloaded layer holds six runs: three originals plus three fresh ones. Stacking
  // would collapse the fresh three onto one baseline and leave only four distinct tops.
  await expect(layer.locator("span")).toHaveCount(6, { timeout: 20_000 });
  const tops = await layer.locator("span").evaluateAll((spans) =>
    Array.from(new Set(spans.map((span) => Math.round(parseFloat((span as HTMLElement).style.top))))).sort(
      (a, b) => a - b
    )
  );
  expect(tops).toHaveLength(3);
  expect(tops[1] - tops[0]).toBeGreaterThan(8);
  expect(Math.abs(tops[2] - tops[1] - (tops[1] - tops[0]))).toBeLessThan(2);
});
