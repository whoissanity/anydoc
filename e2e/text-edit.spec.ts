// DEV-ONLY E2E smoke tests. Not mirrored to anydoc/ (deployment tree).
// Requires: npx playwright install chromium
import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const SAMPLE_PDF = path.join(__dirname, "fixtures", "sample.pdf");

async function openSample(page: Page) {
  await page.goto("/editor");
  await page.locator("#anydoc-file-input").setInputFiles(SAMPLE_PDF);
  await expect(page.locator("[data-page='1']")).toBeVisible({ timeout: 15_000 });
}

/** Picks the "Add new text" tool and clicks blank space inside page 1. */
async function startNewText(page: Page): Promise<Locator> {
  await page.getByTitle("Add new text (click blank area)").click();
  const frame = page.locator("[data-page='1']").first();
  // The page is taller than the viewport, so click a point that is blank *and* on screen:
  // far left, below the fixture's two text lines, which never reaches a text-layer span.
  await frame.click({ position: { x: 40, y: 300 } });
  const textarea = frame.locator("textarea").first();
  await expect(textarea).toBeVisible();
  return textarea;
}

test.describe("editor smoke", () => {
  test("loads the editor and accepts a PDF upload", async ({ page }) => {
    await openSample(page);
    await expect(page.locator("[data-page='1'] canvas")).toBeVisible();
  });
});

test.describe("text-edit flow", () => {
  test.beforeEach(async ({ page }) => {
    await openSample(page);
  });

  test("Enter commits a new text box and keeps the page rendered", async ({ page }) => {
    const textarea = await startNewText(page);
    await textarea.fill("Added text");

    // Enter must save the text (session closes) without dropping the page.
    await textarea.press("Enter");
    await expect(page.locator("[data-page='1'] textarea")).toHaveCount(0);
    await expect(page.locator("[data-page='1'] canvas")).toBeVisible();
  });

  test("Shift+Enter inserts a newline without committing", async ({ page }) => {
    const textarea = await startNewText(page);
    await textarea.fill("line one");
    await textarea.press("Shift+Enter");
    await textarea.pressSequentially("line two");

    // Still open, with both lines in the box.
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("line one\nline two");
  });

  test("Escape closes the editor without baking text", async ({ page }) => {
    const textarea = await startNewText(page);
    await textarea.fill("discard me");
    await textarea.press("Escape");

    await expect(page.locator("[data-page='1'] textarea")).toHaveCount(0);
    await expect(page.locator("[data-page='1'] canvas")).toBeVisible();
  });
});
