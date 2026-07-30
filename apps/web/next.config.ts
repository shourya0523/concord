import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@ibpe/ui", "@ibpe/contracts"],
}

export default nextConfig
