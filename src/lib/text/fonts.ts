const FONT_MAP: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  "Helvetica-Bold": "Helvetica, Arial, sans-serif",
  "Helvetica-Oblique": "Helvetica, Arial, sans-serif",
  "Helvetica-BoldOblique": "Helvetica, Arial, sans-serif",
  TimesRoman: '"Times New Roman", Times, serif',
  Times: '"Times New Roman", Times, serif',
  "Times-Roman": '"Times New Roman", Times, serif',
  "Times-Bold": '"Times New Roman", Times, serif',
  "Times-Italic": '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
  "Courier-Bold": '"Courier New", Courier, monospace',
  ArialMT: "Arial, Helvetica, sans-serif",
  Arial: "Arial, Helvetica, sans-serif",
  "Arial-BoldMT": "Arial, Helvetica, sans-serif",
  Calibri: "Calibri, Candara, Segoe UI, sans-serif",
  Georgia: "Georgia, serif",
  Verdana: "Verdana, Geneva, sans-serif",
};

export function mapPdfFontToCss(pdfFontName: string | undefined | null): string {
  if (!pdfFontName) return "Helvetica, Arial, sans-serif";
  const cleaned = pdfFontName.replace(/^[\w]+[+]/, "").replace(/,.*$/, "").trim();
  if (FONT_MAP[cleaned]) return FONT_MAP[cleaned];
  const key = Object.keys(FONT_MAP).find((k) =>
    cleaned.toLowerCase().includes(k.toLowerCase())
  );
  if (key) return FONT_MAP[key];
  return `"${cleaned}", Helvetica, Arial, sans-serif`;
}

export function guessFontSizeFromHeight(heightPx: number, scale: number): number {
  return Math.max(6, Math.round((heightPx / scale) * 0.85));
}

export function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}
