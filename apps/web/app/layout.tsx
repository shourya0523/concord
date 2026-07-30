import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google"
import type { CSSProperties, ReactNode } from "react"

import "@ibpe/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@ibpe/ui/lib/utils"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
})

export const metadata = {
  title: {
    default: "IBPE — Editorial Finance Terminal",
    template: "%s · IBPE",
  },
  description:
    "Company prep with topic heat + pseudo-RAG, and concept labs — Editorial Finance Terminal",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased font-sans",
        geistSans.variable,
        geistMono.variable,
        instrumentSerif.variable
      )}
      style={
        {
          "--font-sans": "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-geist-mono), ui-monospace, monospace",
          "--font-display": "var(--font-instrument-serif), ui-serif, Georgia, serif",
        } as CSSProperties
      }
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
