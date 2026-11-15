import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import zlib from "node:zlib";

/**
 * Vendors Tesseract language data and writes the manifest the app ships.
 *
 * Every pack is stored locally as `<code>.traineddata.gz` under
 * public/vendor/tesseract/lang so the app never fetches language data at
 * runtime (the CSP would block it anyway). Run this after adding a language:
 *
 *   node scripts/generate-ocr-manifest.mjs            # download missing packs
 *   node scripts/generate-ocr-manifest.mjs --check    # verify only, no network
 *
 * tessdata_fast keeps each model small enough to bundle all advertised
 * languages. English stays on the higher-accuracy model that was already
 * vendored; only missing packs are downloaded.
 */
const OCR_LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "spa", label: "Español" },
  { code: "fra", label: "Français" },
  { code: "deu", label: "Deutsch" },
  { code: "por", label: "Português" },
  { code: "ita", label: "Italiano" },
  { code: "nld", label: "Nederlands" },
  { code: "pol", label: "Polski" },
  { code: "rus", label: "Русский" },
  { code: "ukr", label: "Українська" },
  { code: "tur", label: "Türkçe" },
  { code: "chi_sim", label: "简体中文" },
  { code: "chi_tra", label: "繁體中文" },
  { code: "jpn", label: "日本語" },
  { code: "kor", label: "한국어" },
  { code: "vie", label: "Tiếng Việt" },
  { code: "ind", label: "Bahasa Indonesia" },
  { code: "tha", label: "ไทย" },
  { code: "hin", label: "हिन्दी" },
  { code: "ben", label: "বাংলা" },
  { code: "ara", label: "العربية" },
  { code: "fas", label: "فارسی" },
  { code: "urd", label: "اردو" },
];

const LANG_DIR = path.resolve("public/vendor/tesseract/lang");
const MANIFEST_PATH = path.join(LANG_DIR, "manifest.json");
const TESSDATA_URL = (code) =>
  `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${code}.traineddata`;
const CHECK_ONLY = process.argv.includes("--check");

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          download(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function packBuffer(code) {
  const file = path.join(LANG_DIR, `${code}.traineddata.gz`);
  if (fs.existsSync(file)) return fs.readFileSync(file);

  if (CHECK_ONLY) {
    throw new Error(`Missing vendored pack ${code} — run without --check to download it`);
  }

  process.stdout.write(`[fetch] ${code}… `);
  const raw = await download(TESSDATA_URL(code));
  if (raw.length < 1024) throw new Error(`Refusing implausibly small pack for ${code}`);
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(file, gz);
  console.log(`${(raw.length / 1048576).toFixed(2)} MB → ${(gz.length / 1048576).toFixed(2)} MB gz`);
  return gz;
}

async function main() {
  fs.mkdirSync(LANG_DIR, { recursive: true });
  console.log(`Writing OCR packs into ${LANG_DIR}`);

  const packs = [];
  const languages = {};
  for (const { code, label } of OCR_LANGUAGES) {
    const bytes = await packBuffer(code);
    const entry = {
      code,
      label,
      bytes: bytes.length,
      sha256: sha256(bytes),
      vendored: true,
    };
    packs.push(entry);
    languages[code] = entry;
  }

  const total = packs.reduce((sum, pack) => sum + pack.bytes, 0);

  if (CHECK_ONLY) {
    const existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    for (const pack of packs) {
      const known = existing.languages?.[pack.code];
      if (!known) throw new Error(`${pack.code} is missing from manifest.json`);
      if (known.sha256 !== pack.sha256 || known.bytes !== pack.bytes) {
        throw new Error(`${pack.code} does not match manifest.json — regenerate it`);
      }
    }
    console.log(`All ${packs.length} vendored packs match manifest.json (${(total / 1048576).toFixed(1)} MB)`);
    return;
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    defaultLanguage: "eng",
    languages,
    packs,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${packs.length} vendored packs (${(total / 1048576).toFixed(1)} MB) to ${MANIFEST_PATH}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
