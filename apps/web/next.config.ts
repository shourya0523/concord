import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ibpe/ui",
    "@ibpe/contracts",
    "@ibpe/config",
    "@ibpe/database",
  ],
  // Worktree / monorepo lockfile ambiguity
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Server-only env — never expose Glassdoor scrape secrets via NEXT_PUBLIC_*
  serverExternalPackages: ["@neondatabase/serverless"],
  // packages/contracts uses NodeNext `.js` import specifiers in .ts sources
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    }
    return config
  },
}

export default nextConfig
