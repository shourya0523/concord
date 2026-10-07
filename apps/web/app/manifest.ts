import type { MetadataRoute } from "next"

/** Web app manifest: install name, colours and the Concorde mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Concord",
    short_name: "Concord",
    description: "Interview prep for investment banking and private equity.",
    start_url: "/today",
    display: "standalone",
    background_color: "#f7f1e4",
    theme_color: "#f7f1e4",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}
