/** Reduces untrusted file names to a conservative ASCII slug before they reach `Content-Disposition` headers or `a.download`. */
export function safeDownloadName(input: string, fallback = "document"): string {
  const raw = typeof input === "string" ? input : "";
  const withoutExtension = raw.replace(/\.[A-Za-z0-9]{1,8}$/, "");

  const cleaned = withoutExtension
    // Control characters (including CR/LF) would inject headers.
    .replace(/[\u0000-\u001F\u007F]/g, "")
    // Path separators and characters that break header/attribute quoting.
    .replace(/["'\\/:*?<>|]/g, "")
    .normalize("NFKD")
    .replace(/[^\w .-]/g, "")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();

  return cleaned || fallback;
}
