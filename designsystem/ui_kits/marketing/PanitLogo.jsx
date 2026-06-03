/* Panit logo + wordmark — three workflow nodes + orbiting agent dot.
   Pure CSS animation; no framer-motion dependency. */

function PanitLogo({ size = 28, animate = true, accent = "oklch(0.82 0.13 75)" }) {
  return (
    <span className="logo" style={{ "--logo-size": `${size}px` }} aria-label="Panit">
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12 L20 20 L30 12" opacity="0.6" />
        <path d="M20 20 L20 32" opacity="0.6" />
        <circle cx="10" cy="12" r="3" fill="currentColor" stroke="none" />
        <circle cx="30" cy="12" r="3" fill="currentColor" stroke="none" />
        <circle cx="20" cy="32" r="3" fill="currentColor" stroke="none" />
        <circle cx="20" cy="20" r="4" fill={accent} stroke="none" />
      </svg>
      {animate ? <span className="logo__orbit" aria-hidden /> : null}
    </span>
  );
}

function PanitWordmark({ size = 28 }) {
  return (
    <span className="wordmark">
      <PanitLogo size={size} />
      <span className="wordmark__name">Panit</span>
    </span>
  );
}

Object.assign(window, { PanitLogo, PanitWordmark });
