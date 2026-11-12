// @vitest-environment node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Asserts the route surface is only the two import endpoints and both convert uploads to PDF. */

const ROOT = process.cwd();
const HAS_BUILD = existsSync(path.join(ROOT, ".next", "BUILD_ID"));

function routeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

/** Binds port 0 to learn a free port, then releases it for `next start`. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

describe("convert route surface", () => {
  it("exposes only the from-html and from-office handlers", () => {
    const routes = routeFiles(path.join(ROOT, "src", "app", "api"))
      .map((file) =>
        path
          .relative(path.join(ROOT, "src", "app"), path.dirname(file))
          .split(path.sep)
          .join("/")
      )
      .sort();

    expect(routes).toEqual(["api/convert/from-html", "api/convert/from-office"]);
  });
});

describe.skipIf(!HAS_BUILD)("conversion endpoints (built server)", () => {
  let server: ChildProcess | null = null;
  let baseUrl = "";
  let stderr = "";

  beforeAll(async () => {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;

    const child = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
      { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, NODE_ENV: "production" } }
    );
    server = child;
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      try {
        // Probe the API route itself; the landing page can answer before the API manifest is live.
        const res = await fetch(`${baseUrl}/api/convert/from-html`, {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        });
        if (res.status === 405) return;
      } catch {
        // Not listening yet.
      }
      // A server that exited will never answer, so fail now instead of waiting out the deadline.
      if (child.exitCode !== null) {
        throw new Error(`next start exited (${child.exitCode}): ${stderr.slice(-400)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`next start did not become ready on ${port}: ${stderr.slice(-400)}`);
  }, 60_000);

  afterAll(() => {
    if (!server?.pid) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
    server = null;
  });

  it.each([
    "/api/convert/from-pdf",
    "/api/convert/from-word",
    "/api/convert/to-pdf",
    "/api/convert",
    "/api/export/pdf",
    "/api/export/docx",
  ])("returns 404 for the removed endpoint %s", async (route) => {
    const res = await fetch(`${baseUrl}${route}`, { method: "POST" });
    expect(res.status).toBe(404);
    // A 404 from the app router is an HTML error page, not a JSON handler body.
    expect(res.headers.get("content-type") ?? "").not.toContain("application/json");
  });

  it("converts HTML to a real PDF", async () => {
    const html = `<h1>Quarterly report</h1>${Array.from(
      { length: 300 },
      (_, i) => `<p>Paragraph ${i + 1}: revenue grew across every region.</p>`
    ).join("")}<script>alert(1)</script>`;

    const res = await fetch(`${baseUrl}/api/convert/from-html`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("from-html.pdf");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("HTML Import");
    // Long input has to paginate rather than overflow a single page.
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("converts a .docx upload to a real PDF", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    );
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Imported from Word: contract summary.</w:t></w:r></w:p></w:body></w:document>`
    );
    const docx = await zip.generateAsync({ type: "arraybuffer" });

    const form = new FormData();
    form.append(
      "file",
      new File([docx], "brief.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    const res = await fetch(`${baseUrl}/api/convert/from-office`, { method: "POST", body: form });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain('filename="brief.pdf"');

    const pdf = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(pdf.getTitle()).toBe("brief.docx");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("still rejects a .docx whose bytes are not an Office archive", async () => {
    const form = new FormData();
    form.append("file", new File(["plain text, not a zip"], "fake.docx", { type: "text/plain" }));

    const res = await fetch(`${baseUrl}/api/convert/from-office`, { method: "POST", body: form });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("not a valid Office/OpenDocument archive"),
    });
  });
});
