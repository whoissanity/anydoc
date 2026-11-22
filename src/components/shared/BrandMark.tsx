/** A page with a folded corner and a solid dot: the document stays here. Name-independent. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 3.5h9.5L19 8v12.5H5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14.5 3.5V8H19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="15" r="2.2" fill="var(--c-brand)" />
    </svg>
  );
}
