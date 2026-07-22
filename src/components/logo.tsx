// A real logo: a Russian Orthodox onion dome (купол) topped with an Orthodox cross —
// instantly recognisable as "Russian". Monochrome (currentColor) so it inherits the gold
// primary and adapts to the theme. Scales cleanly from favicon to header size.
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Coupole russe"
      fill="none"
    >
      {/* Onion dome bulb */}
      <path
        d="M12 3.6
           C 12.7 5.6 13.8 6.4 14.9 7.4
           C 16.8 9.1 17.8 11.1 17.8 13.3
           C 17.8 16.6 15.2 18.9 12 18.9
           C 8.8 18.9 6.2 16.6 6.2 13.3
           C 6.2 11.1 7.2 9.1 9.1 7.4
           C 10.2 6.4 11.3 5.6 12 3.6 Z"
        fill="currentColor"
      />
      {/* Dome vertical seams (typical ridged gilding) */}
      <path
        d="M12 5.4 V18.7 M9.1 7.8 C 8.4 10 8.3 13.4 9.6 18.2 M14.9 7.8 C 15.6 10 15.7 13.4 14.4 18.2"
        stroke="var(--background)"
        strokeWidth="0.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* Drum / base the dome sits on */}
      <path d="M8.6 18.9 H15.4 L14.8 21.4 H9.2 Z" fill="currentColor" />
      <rect x="7.7" y="21.2" width="8.6" height="1.4" rx="0.5" fill="currentColor" />
      {/* Orthodox cross on top */}
      <g stroke="currentColor" strokeWidth="0.75" strokeLinecap="round">
        <line x1="12" y1="0.6" x2="12" y2="3.6" />
        <line x1="10.7" y1="1.5" x2="13.3" y2="1.5" />
        <line x1="10.1" y1="2.3" x2="13.9" y2="2.3" />
        <line x1="10.7" y1="3.2" x2="13.3" y2="2.8" />
      </g>
    </svg>
  );
}
