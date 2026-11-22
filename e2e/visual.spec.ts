// DEV-ONLY visual regression tests. Not mirrored to anydoc/ (deployment tree).
// Baselines live in e2e/visual.spec.ts-snapshots and are committed.
// Update baselines: npx playwright test visual --update-snapshots
import path from "node:path";
import { test, expect } from "@playwright/test";

const SAMPLE_PDF = path.join(__dirname, "fixtures", "sample.pdf");

test.describe("visual regression", () => {
  test("editor with a loaded PDF matches the baseline", async ({ page }) => {
    await page.goto("/editor");
    await page.locator("#anydoc-file-input").setInputFiles(SAMPLE_PDF);
    await expect(page.locator("[data-page='1']")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-page='1'] canvas")).toBeVisible();

    // Give the PDF.js canvas paint and the text layer a moment to settle.
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("editor-with-pdf.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
      animations: "disabled",
    });
  });
});
