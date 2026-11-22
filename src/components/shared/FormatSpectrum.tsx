import { FORMATS } from "@/lib/site";

/** Supported formats as inked segments. Driven entirely by FORMATS. */
export function FormatSpectrum({ className }: { className?: string }) {
  return (
    <ul className={`format-spectrum ${className ?? ""}`} aria-label="Supported file formats">
      {FORMATS.map((format) => (
        <li key={format.ext} className="format-spectrum-item">
          <span
            className="format-spectrum-bar"
            style={{ backgroundColor: `var(--ink-${format.family})` }}
            aria-hidden="true"
          />
          <span className="format-spectrum-label">.{format.ext}</span>
        </li>
      ))}
    </ul>
  );
}
