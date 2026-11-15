// DEV-ONLY E2E: PDF/A preparation wiring. Not mirrored to anydoc/ (deployment tree).
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const SAMPLE_PDF = path.join(__dirname, "fixtures", "sample.pdf");

async function openSample(page: Page) {
  await page.goto("/editor");
  await page.locator("#anydoc-file-input").setInputFiles(SAMPLE_PDF);
  await expect(page.locator("[data-page='1'] canvas")).toBeVisible({ timeout: 15_000 });
}

test("PDF/A preparation is reachable and runs entirely in the tab", async ({ page }) => {
  const requirementFailures: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://localhost:3000") && !url.startsWith("data:") && !url.startsWith("blob:")) {
      requirementFailures.push(url);
    }
  });

  await openSample(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "PDF/A archival preparation" }).click();

  await expect(
    page.getByText("Build a PDF/A-2b candidate entirely on this device.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Prepare archival PDF" }).click();

  await expect(page.getByText("sRGB output intent injected")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/PDF\/A-2b XMP metadata/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Download .*-archival\.pdf/ })).toBeVisible();
  expect(requirementFailures).toEqual([]);
});
