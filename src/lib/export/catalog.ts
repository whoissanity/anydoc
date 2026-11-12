// Single source for both export surfaces, so formats/labels/descriptions cannot drift apart.

export type ExportFormatId =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "odt"
  | "ods"
  | "rtf"
  | "md"
  | "html"
  | "txt"
  | "epub"
  | "csv"
  | "json"
  | "png"
  | "jpeg";

export interface ExportFormatMeta {
  id: ExportFormatId;
  label: string;
  extension: string;
  description: string;
  mime: string;
  /** Zips/XML packaging that needs a progress indicator. */
  heavy?: boolean;
}

export const EXPORT_FORMATS: ExportFormatMeta[] = [
  {
    id: "docx",
    label: "Word Document",
    extension: "docx",
    description: "Headings, paragraphs and page breaks as an editable .docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    id: "pptx",
    label: "PowerPoint",
    extension: "pptx",
    description: "One slide per page with its heading and body text",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    heavy: true,
  },
  {
    id: "xlsx",
    label: "Excel Workbook",
    extension: "xlsx",
    description: "Detected tables and rows as a spreadsheet",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "odt",
    label: "OpenDocument Text",
    extension: "odt",
    description: "LibreOffice / OpenOffice writer document",
    mime: "application/vnd.oasis.opendocument.text",
    heavy: true,
  },
  {
    id: "ods",
    label: "OpenDocument Sheet",
    extension: "ods",
    description: "Tables and rows for LibreOffice Calc",
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    heavy: true,
  },
  {
    id: "rtf",
    label: "Rich Text",
    extension: "rtf",
    description: "Legacy word-processor text with bold and italic runs",
    mime: "application/rtf",
  },
  {
    id: "md",
    label: "Markdown",
    extension: "md",
    description: "Headings, lists and paragraphs as clean .md",
    mime: "text/markdown;charset=utf-8",
  },
  {
    id: "html",
    label: "Web Page",
    extension: "html",
    description: "Standalone HTML with escaped text and tables",
    mime: "text/html;charset=utf-8",
  },
  {
    id: "txt",
    label: "Plain Text",
    extension: "txt",
    description: "Every selectable character, page by page",
    mime: "text/plain;charset=utf-8",
  },
  {
    id: "epub",
    label: "EPUB eBook",
    extension: "epub",
    description: "Reflowable EPUB 3 with one chapter per page",
    mime: "application/epub+zip",
    heavy: true,
  },
  {
    id: "csv",
    label: "CSV Data",
    extension: "csv",
    description: "Tables and form fields as comma-separated rows",
    mime: "text/csv;charset=utf-8",
  },
  {
    id: "json",
    label: "JSON Data",
    extension: "json",
    description: "Pages, tables and form-field key-values as JSON",
    mime: "application/json;charset=utf-8",
  },
  {
    id: "png",
    label: "PNG Images",
    extension: "png",
    description: "Every page rendered to crisp PNG (ZIP when multi-page)",
    mime: "image/png",
  },
  {
    id: "jpeg",
    label: "JPEG Images",
    extension: "jpeg",
    description: "Every page rendered to JPEG (ZIP when multi-page)",
    mime: "image/jpeg",
  },
];

export const EXPORT_SECTIONS: Array<{ title: string; ids: ExportFormatId[] }> = [
  { title: "Office & documents", ids: ["docx", "pptx", "xlsx", "odt", "ods", "rtf"] },
  { title: "Web, text & books", ids: ["md", "html", "txt", "epub"] },
  { title: "Structured data", ids: ["csv", "json"] },
  { title: "Images", ids: ["png", "jpeg"] },
];

export function formatMeta(id: string): ExportFormatMeta | undefined {
  return EXPORT_FORMATS.find((format) => format.id === id);
}
