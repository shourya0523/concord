import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google"
import type { Metadata, Viewport } from "next"
import type { CSSProperties, ReactNode } from "react"

import "@ibpe/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@ibpe/ui/lib/utils"

import { appBaseUrl } from "@/lib/notify/config"

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

const SITE_DESCRIPTION =
  "Concord is interview prep for investment banking and private equity. See what each firm actually asks, get every answer graded, and drill the math. It only takes about 12 minutes a day."

/**
 * Site-wide metadata. Icons, the share image and the manifest come from the
 * file conventions in app/ (favicon.ico, icon.png, apple-icon.png,
 * opengraph-image.png, twitter-image.png, manifest.ts).
 */
export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl()),
  applicationName: "Concord",
  title: {
    default: "Concord · Interview prep for IB and PE",
    template: "%s · Concord",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "investment banking interview prep",
    "private equity interview prep",
    "technical interview questions",
    "DCF",
    "LBO",
    "superday",
  ],
  openGraph: {
    type: "website",
    siteName: "Concord",
    title: "Concord: CS has LeetCode. You have Concord.",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Concord: CS has LeetCode. You have Concord.",
    description: SITE_DESCRIPTION,
  },
  appleWebApp: { title: "Concord", capable: true, statusBarStyle: "default" },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: "#f7f1e4",
  colorScheme: "light",
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
