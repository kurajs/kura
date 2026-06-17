// Runtime-safe helpers (no MDX toolchain — must stay out of the Workers bundle).

/**
 * Strip JSX component tags from MDX source for the agent `.md`/llms.txt surface, so
 * agents get clean Markdown instead of raw JSX. Keeps children text; drops <Tag .../>,
 * <Tag ...> and </Tag> for capitalized component names — but leaves anything inside
 * fenced (```…```) or inline (`…`) code untouched.
 */
export function stripMdx(source: string): string {
  // Split on code (fenced or inline), keeping the delimiters as odd-indexed segments.
  const parts = source.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((seg, i) =>
      i % 2 === 1
        ? seg // code — leave verbatim
        : seg.replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>/g, "").replace(/<\/?[A-Z][A-Za-z0-9]*\b[^>]*>/g, ""),
    )
    .join("")
    .replace(/\n{3,}/g, "\n\n");
}
