// RTL detection utility based on Unicode Bidi ranges.
// Returns true if the string contains any character with a Right‑to‑Left direction.
// Used for Arabic, Hebrew, Syriac, Thaana, N’Ko, etc.
export function isRtl(text: string): boolean {
  // Simple regex covering the main RTL blocks in Unicode.
  // This is not exhaustive but sufficient for the current PDF editor use‑case.
  // Unicode ranges:
  //   Hebrew       \u0590‑\u05FF
  //   Arabic       \u0600‑\u06FF
  //   Arabic Supplement \u0750‑\u077F
  //   Arabic Extended‑A \u08A0‑\u08FF
  //   Syriac       \u0700‑\u074F
  //   Thaana       \u0780‑\u07BF
  //   N’Ko         \u07C0‑\u07FF
  //   etc.
  const rtlRegex = /[\u0590-\u08FF]/u;
  return rtlRegex.test(text);
}
