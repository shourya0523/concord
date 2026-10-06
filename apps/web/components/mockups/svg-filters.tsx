/**
 * Torn-paper SVG filters (DESIGN.md §7). Applied only to the decorative
 * `.paper-sheet-surface` layer — never to text.
 *
 * Routine sheets don't use these: their tear is a baked CSS mask
 * (`.paper-torn`). `torn-paper-hero` (animated) is for 1–2 score / milestone
 * moments; `torn-paper-static` is its reduced-motion fallback.
 */
export function MockupSvgFilters() {
  return (
    <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
      <defs>
        <filter id="torn-paper-static" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="4"
            seed="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="9"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id="torn-paper-hero" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" seed="3" result="noise">
            <animate
              attributeName="baseFrequency"
              values="0.04;0.043;0.04"
              dur="10s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="12"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        {/* Rubber-stamp ink: speckled coverage + a slight edge wobble. */}
        <filter id="stamp-ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="speckle" />
          <feColorMatrix
            in="speckle"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.7"
            result="holes"
          />
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="inked" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="wobble" />
          <feDisplacementMap in="inked" in2="wobble" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  )
}
