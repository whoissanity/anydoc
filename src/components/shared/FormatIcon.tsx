"use client";

import {
  BookOpen,
  Download,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Presentation,
  Table2,
} from "lucide-react";
import type { ExportFormatId } from "@/lib/export/catalog";

// One icon per export format, shared by both export surfaces.
export function FormatIcon({
  id,
  size = 20,
  strokeWidth = 1.85,
}: {
  id: ExportFormatId;
  size?: number;
  strokeWidth?: number;
}) {
  const props = { size, strokeWidth };
  switch (id) {
    case "pdf":
      return <Download {...props} />;
    case "pptx":
      return <Presentation {...props} />;
    case "xlsx":
    case "ods":
      return <FileSpreadsheet {...props} />;
    case "odt":
      return <FileText {...props} />;
    case "epub":
      return <BookOpen {...props} />;
    case "html":
      return <FileCode {...props} />;
    case "json":
      return <FileJson {...props} />;
    case "csv":
      return <Table2 {...props} />;
    case "png":
    case "jpeg":
      return <ImageIcon {...props} />;
    default:
      return <FileText {...props} />;
  }
}
