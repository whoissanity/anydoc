# DEV-ONLY Test Infrastructure

Everything in this list is **dev-only** and must NEVER be mirrored to `anydoc/`
(the deployment tree). When syncing `d:\pdf` → `anydoc/`, skip these paths.

## Dev-only files / directories

- `vitest.config.mts` — extended with `@testing-library/react` + `@vitejs/plugin-react`
- `playwright.config.ts` — E2E + visual regression config
- `e2e/` — Playwright specs, fixtures (`sample.pdf`), visual baselines (`e2e/visual.spec.ts-snapshots/`)
- `src/test/setup.ts` — Vitest jest-dom setup
- `src/components/viewer/__tests__/PdfPage.text-edit.test.tsx` — component interaction tests
- `.gitignore` — dev artifact ignore rules
- `package.json` — devDependencies include `@testing-library/*`, `@playwright/test`, `@vitejs/plugin-react`
- `package-lock.json` — lockfile reflects dev-only deps

## How to run the three test layers

### 1. Unit + component interaction tests (Vitest)
```
npm test                    # full run
npm test -- --run path/to/test.tsx
```
Catches: logic regressions, keyboard/event behavior (Enter saves, Shift+Enter newline,
blur-commit, page preservation after reload).

### 2. E2E smoke tests (Playwright)
```
npx playwright install chromium     # one-time browser install (matches @playwright/test)
npm run test:e2e
```
Catches: full user flows (upload PDF → add text → Enter → stays on page).

### 3. Visual regression (Playwright screenshots)
```
npm run test:visual                 # compare against baselines
npm run test:visual -- --update-snapshots   # refresh baselines
```
Catches: layout/render regressions (double-text, missing overlays, spacing).
Baseline images are committed in `e2e/visual.spec.ts-snapshots/` and are
platform-specific (`*-win32.png` today). Regenerate them on the machine that runs
the check; `test-results/`, `playwright-report/` and `coverage/` stay ignored.

## Sync discipline

When mirroring to `anydoc/`, copy ONLY:
- `src/` (minus `src/test/` and any `*.test.tsx` component tests)
- `public/`
- `next.config.ts`, `tsconfig.json`, `tailwind.config.*`, `postcss.config.*`
- `package.json` (production deps only — strip dev-only test deps)
- `README.md`

Do NOT copy the dev-only paths listed above.
