/** Grading-bench backdrop motif.
 *
 * A fixed, non-interactive layer drawn behind the app: a faint draftsman
 * rendering of a trading card at true 63.5 × 88.9 aspect — corner-bracket
 * registration marks, dashed inner frame, centering crosshair and dimension
 * callouts — with a slow scanner pass sweeping the outline. A second, smaller
 * outline sits low on the opposite side for balance. Pure SVG + CSS; static
 * under prefers-reduced-motion via the global animation kill-switch.
 */
export function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Primary card outline — upper right, tilted like a card set on a bench */}
      <svg
        viewBox="0 0 340 470"
        className="absolute -right-[4vw] top-[6vh] w-[34vw] min-w-[300px] max-w-[520px] rotate-[8deg]"
        fill="none"
      >
        {/* card edge, true 63.5:88.9 ratio (254 × 355.6 units) */}
        <rect
          x="43"
          y="57"
          width="254"
          height="355.6"
          rx="12"
          stroke="var(--motif-stroke)"
          strokeWidth="1.5"
        />
        {/* detected inner frame */}
        <rect
          x="61"
          y="76"
          width="218"
          height="317.6"
          rx="7"
          stroke="var(--motif-stroke)"
          strokeWidth="1"
          strokeDasharray="5 7"
        />
        {/* centering crosshair */}
        <g stroke="var(--motif-stroke)" strokeWidth="1">
          <line x1="170" y1="222.8" x2="170" y2="246.8" />
          <line x1="158" y1="234.8" x2="182" y2="234.8" />
        </g>
        {/* corner registration brackets */}
        <g stroke="var(--motif-accent)" strokeWidth="1.5">
          <path d="M35 71 v-14 a8 8 0 0 1 8 -8 h14" />
          <path d="M283 49 h14 a8 8 0 0 1 8 8 v14" />
          <path d="M305 398.6 v14 a8 8 0 0 1 -8 8 h-14" />
          <path d="M57 420.6 h-14 a8 8 0 0 1 -8 -8 v-14" />
        </g>
        {/* dimension callouts */}
        <g stroke="var(--motif-stroke)" strokeWidth="1">
          <line x1="43" y1="38" x2="297" y2="38" />
          <line x1="43" y1="34" x2="43" y2="42" />
          <line x1="297" y1="34" x2="297" y2="42" />
          <line x1="318" y1="57" x2="318" y2="412.6" />
          <line x1="314" y1="57" x2="322" y2="57" />
          <line x1="314" y1="412.6" x2="322" y2="412.6" />
        </g>
        <g
          fill="var(--motif-accent)"
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="9"
          letterSpacing="0.08em"
        >
          <text x="170" y="30" textAnchor="middle">
            63.5 mm
          </text>
          <text
            x="330"
            y="234.8"
            textAnchor="middle"
            transform="rotate(90 330 234.8)"
          >
            88.9 mm
          </text>
        </g>
        {/* scanner pass — clipped to the card, drifts down and back */}
        <clipPath id="bench-card-clip">
          <rect x="43" y="57" width="254" height="355.6" rx="12" />
        </clipPath>
        <g clipPath="url(#bench-card-clip)">
          <g className="animate-bench-sweep">
            <rect
              x="43"
              y="57"
              width="254"
              height="92"
              fill="url(#bench-sweep-fade)"
            />
            <line
              x1="43"
              y1="149"
              x2="297"
              y2="149"
              stroke="var(--motif-sweep)"
              strokeWidth="1.5"
            />
          </g>
        </g>
        <defs>
          <linearGradient id="bench-sweep-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--motif-sweep)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--motif-sweep)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
      </svg>

      {/* Secondary outline — low left, fainter, counter-tilted */}
      <svg
        viewBox="0 0 254 355.6"
        className="absolute -left-[6vw] bottom-[-8vh] w-[22vw] min-w-[200px] max-w-[360px] -rotate-[10deg] opacity-60"
        fill="none"
      >
        <rect
          x="1"
          y="1"
          width="252"
          height="353.6"
          rx="12"
          stroke="var(--motif-stroke)"
          strokeWidth="1.5"
        />
        <rect
          x="19"
          y="20"
          width="216"
          height="315.6"
          rx="7"
          stroke="var(--motif-stroke)"
          strokeWidth="1"
          strokeDasharray="5 7"
        />
      </svg>
    </div>
  );
}
