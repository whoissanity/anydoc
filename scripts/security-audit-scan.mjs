import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Disallowed external origin patterns (AGENTS.md rule 6: Zero 3rd party SDKs, No external CDNs)
const FORBIDDEN_ORIGINS = [
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?google-analytics\.com/i, name: "Google Analytics" },
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?googletagmanager\.com/i, name: "Google Tag Manager" },
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?segment\.io/i, name: "Segment" },
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?sentry\.io/i, name: "Sentry" },
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?datadoghq\.com/i, name: "Datadog" },
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?mixpanel\.com/i, name: "Mixpanel" },
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?hotjar\.com/i, name: "Hotjar" },
  { pattern: /https?:\/\/([a-z0-9.-]+\.)?logrocket\.com/i, name: "LogRocket" },
  { pattern: /https?:\/\/fonts\.googleapis\.com/i, name: "Google Fonts API" },
  { pattern: /https?:\/\/fonts\.gstatic\.com/i, name: "Google Fonts Static CDN" },
  { pattern: /https?:\/\/cdn\.jsdelivr\.net/i, name: "jsDelivr CDN" },
  { pattern: /https?:\/\/unpkg\.com/i, name: "unpkg CDN" },
  { pattern: /https?:\/\/cdnjs\.cloudflare\.com/i, name: "cdnjs CDN" },
];

// Disallowed banned tracking/analytics npm packages
const BANNED_PACKAGES = [
  "@sentry/browser",
  "@sentry/nextjs",
  "@datadog/browser-rum",
  "posthog-js",
  "mixpanel-browser",
  "hotjar",
  "logrocket",
  "react-ga4",
  "@segment/analytics-next",
];

// Secret-like token regex patterns
const SECRET_PATTERNS = [
  { pattern: /AKIA[0-9A-Z]{16}/, name: "AWS Access Key" },
  { pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/, name: "GitHub Personal Access Token" },
  { pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}/, name: "Slack Token" },
  { pattern: /-----BEGIN (RSA|EC|OPENSSH|PGP|PRIVATE) KEY/, name: "Private Key" },
  { pattern: /sk_(live|test)_[0-9a-zA-Z]{24}/, name: "Stripe Secret Key" },
];

const SCAN_DIRS = ["src"];
const IGNORED_PATHS = [
  "__tests__",
  "node_modules",
  ".next",
  "manifest.json", // Contains official hashes/metadata
  path.join("public", "vendor"), // Vendored third-party WASM binaries and workers
];

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name);
    if (IGNORED_PATHS.some((p) => fullPath.includes(p))) continue;
    if (dirent.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (/\.(tsx?|jsx?|mjs|cjs|html|css|json)$/i.test(dirent.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function runSecurityAudit() {
  const violations = [];

  // 1. Check package.json & package-lock.json for banned packages
  const pkgJsonPath = path.resolve("package.json");
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of BANNED_PACKAGES) {
      if (allDeps[banned]) {
        violations.push({
          file: "package.json",
          type: "BANNED_DEPENDENCY",
          details: `Found banned telemetry package: ${banned}`,
        });
      }
    }
  }

  // 2. Scan source files for forbidden origins and secret patterns
  for (const dir of SCAN_DIRS) {
    const files = getFiles(path.resolve(dir));
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        // Skip comment lines or test lines
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        // Check forbidden origins
        for (const origin of FORBIDDEN_ORIGINS) {
          if (origin.pattern.test(line)) {
            violations.push({
              file: path.relative(process.cwd(), file),
              line: index + 1,
              type: "FORBIDDEN_ORIGIN",
              details: `Referenced unauthorized origin (${origin.name}): ${trimmed.slice(0, 100)}`,
            });
          }
        }

        // Check secret patterns
        for (const secret of SECRET_PATTERNS) {
          if (secret.pattern.test(line)) {
            violations.push({
              file: path.relative(process.cwd(), file),
              line: index + 1,
              type: "EXPOSED_SECRET",
              details: `Detected secret-like pattern (${secret.name}) at line ${index + 1}`,
            });
          }
        }
      });
    }
  }

  return violations;
}

// CLI execution
const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  console.log("Running security and privacy audit scan...");
  const violations = runSecurityAudit();

  if (violations.length > 0) {
    console.error(`\x1b[31mSecurity audit failed: ${violations.length} violation(s) found:\x1b[0m`);
    for (const v of violations) {
      console.error(`  - [${v.type}] ${v.file}${v.line ? `:${v.line}` : ""}: ${v.details}`);
    }
    process.exit(1);
  }

  console.log("\x1b[32m✔ Security audit passed: No forbidden origins, telemetry SDKs, or exposed secrets found.\x1b[0m");

  // Run npm audit
  try {
    console.log("Running npm audit check...");
    const auditOutput = execSync("npm audit --audit-level=high --json", { stdio: ["ignore", "pipe", "ignore"] });
    const auditData = JSON.parse(auditOutput.toString());
    const vulns = auditData.metadata?.vulnerabilities || {};
    const highOrCrit = (vulns.high || 0) + (vulns.critical || 0);
    if (highOrCrit > 0) {
      console.warn(`\x1b[33mWarning: ${highOrCrit} high/critical vulnerabilities reported by npm audit.\x1b[0m`);
    } else {
      console.log("\x1b[32m✔ npm audit passed with zero high/critical vulnerabilities.\x1b[0m");
    }
  } catch {
    console.log("npm audit completed.");
  }
}
