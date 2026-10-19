import { cn } from "@ibpe/ui/lib/utils"

/** A paperclip — a streak freeze held in reserve, or a clipped pack. */
export function Paperclip({ className, slide = false }: { className?: string; slide?: boolean }) {
  return (
    <svg
      viewBox="0 0 14 38"
      className={cn("h-[38px] w-[14px]", slide && "motion-clip-on", className)}
      aria-hidden
    >
      <path
        d="M5 33 V7 a3 3 0 0 1 6 0 V28 a5 5 0 0 1 -10 0 V10"
        fill="none"
        stroke="var(--clip-metal)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
