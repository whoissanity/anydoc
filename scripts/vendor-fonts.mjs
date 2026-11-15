/**
 * One-shot vendor script: downloads OFL-licensed metric-compatible substitutes
 * into public/vendor/fonts. Runtime never hits the network — only this script does.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = join(ROOT, "public", "vendor", "fonts");
const SCRIPTS = join(FONTS, "scripts");
const TMP = join(ROOT, ".tmp-font-vendor");

async function download(url, dest) {
  if (existsSync(dest) && readFileSync(dest).byteLength > 10_000) {
    console.log(`skip (exists) ${dest}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`fetch ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`wrote ${dest} (${readFileSync(dest).byteLength} bytes)`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function extractTarGz(archive, outDir) {
  mkdirSync(outDir, { recursive: true });
  // Windows often has tar; fall back to node if needed.
  execFileSync("tar", ["-xzf", archive, "-C", outDir], { stdio: "inherit" });
}

function findFile(root, name) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry.name === name) {
      return path;
    }
  }
  return null;
}

const DIRECT = [
  {
    url: "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/full/ttf/NotoSans-Regular.ttf",
    dest: join(FONTS, "NotoSans-Regular.ttf"),
  },
  {
    url: "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/full/ttf/NotoSans-Bold.ttf",
    dest: join(FONTS, "NotoSans-Bold.ttf"),
  },
  {
    url: "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansArabic/full/ttf/NotoSansArabic-Regular.ttf",
    dest: join(SCRIPTS, "NotoSansArabic-Regular.ttf"),
  },
  {
    url: "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansDevanagari/full/ttf/NotoSansDevanagari-Regular.ttf",
    dest: join(SCRIPTS, "NotoSansDevanagari-Regular.ttf"),
  },
  {
    url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf",
    dest: join(SCRIPTS, "NotoSansSC-Regular.otf"),
  },
  {
    url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf",
    dest: join(SCRIPTS, "NotoSansJP-Regular.otf"),
  },
  {
    url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf",
    dest: join(SCRIPTS, "NotoSansKR-Regular.otf"),
  },
];

const LIBERATION_FROM_TAR = [
  "LiberationSerif-Regular.ttf",
  "LiberationSerif-Bold.ttf",
  "LiberationSerif-Italic.ttf",
  "LiberationSerif-BoldItalic.ttf",
  "LiberationMono-Regular.ttf",
  "LiberationMono-Bold.ttf",
  "LiberationMono-Italic.ttf",
  "LiberationMono-BoldItalic.ttf",
];

const SCRIPT_META = {
  arabic: { label: "Arabic", cssFamily: "Noto Sans Arabic", file: "NotoSansArabic-Regular.ttf" },
  devanagari: {
    label: "Devanagari",
    cssFamily: "Noto Sans Devanagari",
    file: "NotoSansDevanagari-Regular.ttf",
  },
  "cjk-sc": { label: "Chinese (Simplified)", cssFamily: "Noto Sans SC", file: "NotoSansSC-Regular.otf" },
  "cjk-jp": { label: "Japanese", cssFamily: "Noto Sans JP", file: "NotoSansJP-Regular.otf" },
  "cjk-kr": { label: "Korean", cssFamily: "Noto Sans KR", file: "NotoSansKR-Regular.otf" },
};

async function vendorLiberation() {
  const needed = LIBERATION_FROM_TAR.filter((name) => {
    const dest = join(FONTS, name);
    return !(existsSync(dest) && readFileSync(dest).byteLength > 10_000);
  });
  if (needed.length === 0) {
    console.log("Liberation Serif/Mono already present");
    return;
  }

  mkdirSync(TMP, { recursive: true });
  const archive = join(TMP, "liberation-fonts-ttf-2.1.5.tar.gz");
  await download(
    "https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz",
    archive
  );
  const out = join(TMP, "extracted");
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  extractTarGz(archive, out);

  for (const name of LIBERATION_FROM_TAR) {
    const src = findFile(out, name);
    if (!src) throw new Error(`Missing ${name} in Liberation archive`);
    const dest = join(FONTS, name);
    copyFileSync(src, dest);
    console.log(`copied ${name} (${readFileSync(dest).byteLength} bytes)`);
  }
}

async function main() {
  mkdirSync(SCRIPTS, { recursive: true });
  await vendorLiberation();
  for (const file of DIRECT) {
    await download(file.url, file.dest);
  }

  const packs = {};
  for (const [id, meta] of Object.entries(SCRIPT_META)) {
    const path = join(SCRIPTS, meta.file);
    if (!existsSync(path)) {
      console.warn(`missing script pack ${id}`);
      continue;
    }
    packs[id] = {
      id,
      label: meta.label,
      cssFamily: meta.cssFamily,
      file: meta.file,
      url: `/vendor/fonts/scripts/${meta.file}`,
      bytes: readFileSync(path).byteLength,
      sha256: sha256(path),
    };
  }

  writeFileSync(
    join(SCRIPTS, "manifest.json"),
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), packs }, null, 2) + "\n"
  );
  console.log("wrote scripts/manifest.json");

  // Cleanup temp; keep fonts.
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
