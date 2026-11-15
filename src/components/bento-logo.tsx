/**
 * The Bento logo — same artwork as `public/icon.svg`, inlined so it paints
 * with the page (no extra request). Brand colours are fixed, not themed,
 * matching the favicon and the boot splash.
 *
 * @param className - Sizing / layout classes for the `<svg>`.
 * @param title - Accessible name; omit for a decorative logo (aria-hidden).
 */
export function BentoLogo({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-testid="bento-logo"
    >
      <rect width="512" height="512" rx="112" fill="#183d3d" />
      <rect x="96" y="96" width="148" height="320" rx="28" fill="#eef3f1" />
      <rect x="268" y="96" width="148" height="148" rx="28" fill="#93b1a6" />
      <rect x="268" y="268" width="148" height="148" rx="28" fill="#5c8374" />
    </svg>
  );
}
