import { PDFName } from "pdf-lib";
import { loadPdfLib } from "@/lib/document/pages";
import { assertPdfBytes, looksLikePdf } from "@/lib/document/validate";

export type HealthSeverity = "critical" | "warning" | "info";
export type HealthCategory = "structure" | "metadata" | "security" | "content" | "size";
export type HealthGrade = "A" | "B" | "C" | "D" | "F";

export interface HealthIssue {
  id: string;
  severity: HealthSeverity;
  category: HealthCategory;
  title: string;
  detail: string;
  fix: string;
}

export interface HealthCategoryScore {
  id: HealthCategory;
  label: string;
  score: number;
  weight: number;
  issueCount: number;
}

export interface DocumentHealth {
  score: number;
  grade: HealthGrade;
  categories: HealthCategoryScore[];
  issues: HealthIssue[];
  pageCount: number;
  byteLength: number;
}

const CATEGORY_META: Array<{ id: HealthCategory; label: string; weight: number }> = [
  { id: "structure", label: "Structure", weight: 25 },
  { id: "metadata", label: "Metadata", weight: 15 },
  { id: "security", label: "Security", weight: 30 },
  { id: "content", label: "Content", weight: 20 },
  { id: "size", label: "File size", weight: 10 },
];

const PENALTY: Record<HealthSeverity, number> = {
  critical: 30,
  warning: 12,
  info: 4,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function gradeFor(score: number): HealthGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function asciiSlice(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = start; i < end; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, end)));
  }
  return out;
}

function sampleAscii(bytes: Uint8Array): string {
  const head = asciiSlice(bytes, 0, Math.min(bytes.byteLength, 8 * 1024 * 1024));
  const tailStart = Math.max(0, bytes.byteLength - 2 * 1024 * 1024);
  const tail = bytes.byteLength > tailStart ? asciiSlice(bytes, tailStart, bytes.byteLength) : "";
  return `${head}\n${tail}`;
}

function count(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function issue(
  id: string,
  severity: HealthSeverity,
  category: HealthCategory,
  title: string,
  detail: string,
  fix: string
): HealthIssue {
  return { id, severity, category, title, detail, fix };
}

function finalize(
  issues: HealthIssue[],
  meta: { pageCount: number; byteLength: number },
  unreadable = false
): DocumentHealth {
  const categories = CATEGORY_META.map((definition) => {
    const categoryIssues = issues.filter((item) => item.category === definition.id);
    const penalty = categoryIssues.reduce((sum, item) => sum + PENALTY[item.severity], 0);
    return {
      ...definition,
      score: unreadable ? 0 : clampScore(100 - penalty),
      issueCount: categoryIssues.length,
    };
  });

  const score = unreadable
    ? 0
    : clampScore(
        categories.reduce((sum, category) => sum + category.score * category.weight, 0) / 100
      );

  const order: Record<HealthSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return {
    score,
    grade: gradeFor(score),
    categories,
    issues: [...issues].sort((a, b) => order[a.severity] - order[b.severity]),
    pageCount: meta.pageCount,
    byteLength: meta.byteLength,
  };
}



export async function analyzeDocumentHealth(bytes: Uint8Array): Promise<DocumentHealth> {
  assertPdfBytes(bytes, "This file");

  let doc: Awaited<ReturnType<typeof loadPdfLib>>;
  try {
    doc = await loadPdfLib(bytes);
  } catch (error) {
    return finalize(
      [
        issue(
          "structure.unreadable",
          "critical",
          "structure",
          "The document could not be parsed",
          error instanceof Error ? error.message : "The PDF structure is invalid",
          "Run Repair PDF, or recreate the document from its source."
        ),
      ],
      { pageCount: 0, byteLength: bytes.byteLength },
      true
    );
  }

  const issues: HealthIssue[] = [];
  const sample = sampleAscii(bytes);
  const pageCount = doc.getPageCount();
  const pages = doc.getPages();
  const catalog = doc.catalog;

  if (!looksLikePdf(bytes)) {
    issues.push(
      issue(
        "structure.header",
        "critical",
        "structure",
        "Missing PDF header",
        "The file does not start with a %PDF- header.",
        "Re-export the document from its source application."
      )
    );
  }
  if (!sample.includes("%%EOF")) {
    issues.push(
      issue(
        "structure.eof",
        "warning",
        "structure",
        "Trailer marker missing",
        "No %%EOF marker was found; some readers may reject the file.",
        "Run Repair PDF to rebuild the cross-reference table and trailer."
      )
    );
  }
  if (!sample.includes("startxref")) {
    issues.push(
      issue(
        "structure.startxref",
        "warning",
        "structure",
        "Cross-reference pointer missing",
        "No startxref pointer was found.",
        "Run Repair PDF before sharing the file."
      )
    );
  }

  if (pageCount === 0) {
    issues.push(
      issue(
        "structure.pages",
        "critical",
        "structure",
        "No pages",
        "The document has no pages.",
        "Recreate the PDF or repair it."
      )
    );
  } else if (pageCount > 5_000) {
    issues.push(
      issue(
        "structure.pages",
        "critical",
        "structure",
        "Very large page count",
        `${pageCount} pages exceeds the editor's 5,000-page safety limit.`,
        "Split the document before opening it in the editor."
      )
    );
  } else if (pageCount > 500) {
    issues.push(
      issue(
        "structure.pages",
        "warning",
        "structure",
        "Large page count",
        `${pageCount} pages may be slow to view and edit.`,
        "Split the document into smaller files for editing."
      )
    );
  }

  const sizes = new Set<string>();
  for (const page of pages) {
    const { width, height } = page.getSize();
    sizes.add(`${Math.round(width)}×${Math.round(height)}`);
  }
  if (sizes.size > 1) {
    issues.push(
      issue(
        "structure.pageSizes",
        "warning",
        "structure",
        "Mixed page sizes",
        `${sizes.size} page sizes were found.`,
        "Normalize page sizes before printing or merging."
      )
    );
  }

  const title = (doc.getTitle() || "").trim();
  const author = (doc.getAuthor() || "").trim();
  const subject = (doc.getSubject() || "").trim();
  const producer = (doc.getProducer() || "").trim();
  const creator = (doc.getCreator() || "").trim();

  if (!title) {
    issues.push(
      issue(
        "metadata.title",
        "info",
        "metadata",
        "No title",
        "The document has no Title property.",
        "Set a descriptive title in Document properties."
      )
    );
  }
  if (!author) {
    issues.push(
      issue(
        "metadata.author",
        "info",
        "metadata",
        "No author",
        "The document has no Author property.",
        "Set the author in Document properties."
      )
    );
  }
  if (!subject) {
    issues.push(
      issue(
        "metadata.subject",
        "info",
        "metadata",
        "No subject",
        "The document has no Subject property.",
        "Add a short subject description."
      )
    );
  }
  if (!producer) {
    issues.push(
      issue(
        "metadata.producer",
        "info",
        "metadata",
        "No producer",
        "The document has no Producer property.",
        "This is harmless; it only makes the file harder to identify."
      )
    );
  }
  if (!creator) {
    issues.push(
      issue(
        "metadata.creator",
        "info",
        "metadata",
        "No creator",
        "The document has no Creator property.",
        "This is harmless; it only makes the file harder to identify."
      )
    );
  }

  const hasXmp = catalog.has(PDFName.of("Metadata")) || sample.includes("<x:xmpmeta");
  if (hasXmp) {
    issues.push(
      issue(
        "metadata.xmp",
        "warning",
        "metadata",
        "XMP metadata stream",
        "An XMP metadata stream is present and may contain hidden properties.",
        "Run Sanitize document to remove XMP metadata before sharing."
      )
    );
  }

  const encrypted = doc.isEncrypted || sample.includes("/Encrypt");
  if (encrypted) {
    issues.push(
      issue(
        "security.encryption",
        "warning",
        "security",
        "Encrypted document",
        "The file is encrypted and may require a password to open.",
        "Remove the password if recipients do not need it, or share the password separately."
      )
    );
  }

  const hasOpenAction = catalog.has(PDFName.of("OpenAction"));
  const hasAA = catalog.has(PDFName.of("AA"));
  const hasJavaScript = sample.includes("/JavaScript") || sample.includes("/JS");
  if (hasOpenAction || hasAA || hasJavaScript) {
    issues.push(
      issue(
        "security.actions",
        "critical",
        "security",
        "JavaScript or automatic action",
        "The document contains scripts or an automatic action.",
        "Run Sanitize document with JavaScript and auto actions enabled."
      )
    );
  }

  if (sample.includes("/Launch") || sample.includes("/SubmitForm") || sample.includes("/ImportData")) {
    issues.push(
      issue(
        "security.external",
        "critical",
        "security",
        "External launch or submit action",
        "The document can launch a program or send form data.",
        "Run Sanitize document before sharing the file."
      )
    );
  }

  if (sample.includes("/EmbeddedFile") || sample.includes("/Filespec")) {
    issues.push(
      issue(
        "security.attachments",
        "warning",
        "security",
        "Embedded files",
        "The document contains embedded files or a file specification.",
        "Remove attachments if they are not part of the document."
      )
    );
  }

  let formFields = 0;
  if (catalog.has(PDFName.of("AcroForm"))) {
    try {
      formFields = doc.getForm().getFields().length;
    } catch {
      formFields = 0;
    }
    issues.push(
      issue(
        "security.forms",
        "info",
        "security",
        "Interactive form fields",
        `${formFields} form field(s) are present.`,
        "Flatten the form if recipients should not edit it."
      )
    );
  }

  let annotations = 0;
  for (const page of pages) {
    try {
      const annots = page.node.get(PDFName.of("Annots")) as unknown as
        | { size?: () => number }
        | undefined;
      annotations += annots?.size?.() ?? 0;
    } catch {
      continue;
    }
  }

  if (annotations > 0) {
    issues.push(
      issue(
        "security.annotations",
        "info",
        "security",
        "Annotations present",
        `${annotations} annotation(s) are present.`,
        "Remove annotations if the document is being shared for final review."
      )
    );
  }

  const fontRefs = count(sample, "/Font");
  const embeddedFonts = count(sample, "/FontFile");
  const images = count(sample, "/Image");
  const hasTextOperators =
    sample.includes(" Tj") || sample.includes(" TJ") || sample.includes("BT");

  if (fontRefs === 0 && images > 0) {
    issues.push(
      issue(
        "content.imageOnly",
        "warning",
        "content",
        "Image-only pages",
        "No fonts or text operators were detected, so the page is likely a scan.",
        "Run OCR to make the text selectable and searchable."
      )
    );
  } else if (fontRefs > 0 && embeddedFonts === 0) {
    issues.push(
      issue(
        "content.fonts",
        "warning",
        "content",
        "Fonts are not embedded",
        "Fonts are referenced but no embedded font program was detected.",
        "Embed fonts or export to PDF/A so the document renders the same everywhere."
      )
    );
  }

  if (!hasTextOperators && fontRefs === 0) {
    issues.push(
      issue(
        "content.text",
        "critical",
        "content",
        "No selectable text",
        "The document has no detectable text layer.",
        "Run OCR before sharing a scanned document."
      )
    );
  }

  const perPage = pageCount > 0 ? bytes.byteLength / pageCount : bytes.byteLength;
  if (perPage > 2 * 1024 * 1024) {
    issues.push(
      issue(
        "size.pages",
        "warning",
        "size",
        "Large average page size",
        `The document averages ${(perPage / (1024 * 1024)).toFixed(1)} MB per page.`,
        "Compress or downsample the pages before sharing."
      )
    );
  }

  if (bytes.byteLength > 100 * 1024 * 1024) {
    issues.push(
      issue(
        "size.limit",
        "critical",
        "size",
        "File is too large",
        "The file exceeds the 100 MB editor limit.",
        "Compress or split the document."
      )
    );
  } else if (bytes.byteLength > 50 * 1024 * 1024) {
    issues.push(
      issue(
        "size.large",
        "warning",
        "size",
        "Large file",
        "The file is larger than 50 MB.",
        "Compress the file before emailing or uploading it."
      )
    );
  }

  return finalize(issues, { pageCount, byteLength: bytes.byteLength });
}

export function healthHeadline(health: DocumentHealth): string {
  return `Health ${health.score}/100 · grade ${health.grade}`;
}