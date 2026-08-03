import { cn } from "@ibpe/ui/lib/utils"

const SIZES = {
  sm: { width: 110, height: 49, className: "h-7 w-auto" },
  md: { width: 148, height: 66, className: "h-9 w-auto" },
  lg: { width: 186, height: 82, className: "h-11 w-auto" },
} as const

type ConcordLogoProps = {
  size?: keyof typeof SIZES
  className?: string
  /** Accepted for call-site compatibility; plain img loads eagerly when true. */
  priority?: boolean
}

/**
 * Concorde silhouette brand mark — transparent PNG, no wordmark.
 * Uses a plain <img> (not next/image) so the optimizer cannot matte
 * transparency onto white and browsers pick up asset renames immediately.
 */
export function ConcordLogo({
  size = "md",
  className,
  priority = false,
}: ConcordLogoProps) {
  const dims = SIZES[size]
  return (
    // eslint-disable-next-line @next/next/no-img-element -- intentional: preserve PNG alpha without next/image matte/cache
    <img
      src="/brand/concord-silhouette.png"
      alt="Concord"
      width={dims.width}
      height={dims.height}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      className={cn(
        "bg-transparent object-contain object-left",
        dims.className,
        className,
      )}
    />
  )
}
